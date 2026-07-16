import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak, getFileInfo } from "../types";
import { hashIP } from "../hash";

const RATE_LIMIT_SECONDS = 15;

// Route definition
export const route = createRoute({
	method: "post",
	path: "/api/paks/:hash/download",
	tags: ["Paks"],
	summary: "Increment download count for a Pak",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "Returns the pak with updated downloads",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						pak: z.object({
							hash: z.string(),
							downloads: z.number().int(),
						}).passthrough(),
					}),
				},
			},
		},
		"404": {
			description: "Pak not found",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
					}),
				},
			},
		},
		"429": {
			description: "Rate limit — too many requests from this IP",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
						retry_after_seconds: z.number(),
					}),
				},
			},
		},
	},
});

// Handler
export const handler = async (c: Context<{ Bindings: Env }>) => {
	const { hash } = c.req.valid("param") as { hash: string };

	// Verify pak exists
	const row = await c.env.DB.prepare(
		"SELECT hash, data, downloads, file_hash FROM paks WHERE hash = ?",
	)
		.bind(hash)
		.first<{ hash: string; data: string; downloads: number; file_hash: string }>();

	if (!row) {
		return c.json({ success: false, error: "Not found" }, 404);
	}

	// ── Per-IP rate limiting via D1 ──
	const ip = c.req.header("cf-connecting-ip");
	if (!ip) {
		return c.json({ success: false, error: "Could not determine client IP" }, 400);
	}
	const ipHash = await hashIP(ip);
	const now = Math.floor(Date.now() / 1000);

	const lastDownload = await c.env.DB.prepare(
		"SELECT requested_at FROM download_log WHERE ip_hash = ? AND pak_hash = ?",
	)
		.bind(ipHash, hash)
		.first<{ requested_at: number }>();

	if (lastDownload) {
		const elapsed = now - lastDownload.requested_at;
		if (elapsed < RATE_LIMIT_SECONDS) {
			return c.json(
				{
					success: false,
					error: "Please wait before downloading again",
					retry_after_seconds: RATE_LIMIT_SECONDS - elapsed,
				},
				429,
			);
		}
	}

	// Record this download attempt
	await c.env.DB.prepare(
		"INSERT OR REPLACE INTO download_log (ip_hash, pak_hash, requested_at) VALUES (?, ?, ?)",
	)
		.bind(ipHash, hash, now)
		.run();

	// Increment counter
	await c.env.DB.prepare(
		"UPDATE paks SET downloads = downloads + 1, updated_at = datetime('now') WHERE hash = ?",
	)
		.bind(hash)
		.run();

	// Prune old rate-limit entries (keep only last 60s)
	c.executionCtx.waitUntil(
		c.env.DB.prepare("DELETE FROM download_log WHERE requested_at < ?")
			.bind(now - 60).run().catch(() => {}),
	);

	const pak: Record<string, unknown> = {
		...parsePak({
			...row,
			downloads: row.downloads + 1,
		} as { hash: string; data: string; downloads: number }),
	};

	// Include file info if attached
	if (row.file_hash) {
		const fileInfo = await getFileInfo(c.env.DB, row.file_hash);
		if (fileInfo) pak.file = fileInfo;
	}

	return c.json({ success: true, pak }, 200);
};
