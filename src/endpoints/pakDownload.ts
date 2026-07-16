import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak, getFileInfo } from "../types";
import { hashIP } from "../hash";

const TG_API = "https://api.telegram.org";
const RATE_LIMIT_SECONDS = 15;

// Route definition
export const route = createRoute({
	method: "post",
	path: "/api/paks/:hash/download",
	tags: ["Paks"],
	summary: "Download a Pak — JSON if no file attached, binary file otherwise",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "If pak has no file — JSON. If attached file — binary download.",
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
				"application/octet-stream": {
					schema: z.any(),
				},
			},
		},
		"400": {
			description: "Bad request (missing IP)",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
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
	const { hash } = (c.req.valid as (target: string) => { hash: string })("param");

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

	// ── If a file is attached, proxy it from Telegram ──
	if (row.file_hash) {
		const fileRow = await c.env.DB.prepare(
			"SELECT telegram_file_id, file_name, mime_type FROM files WHERE hash = ?",
		).bind(row.file_hash).first<{ telegram_file_id: string; file_name: string; mime_type: string }>();

		if (fileRow) {
			try {
				const botToken = (c.env as any).BOT_TOKEN as string;

				// Get download path from Telegram API
				const fileRes = await fetch(
					`${TG_API}/bot${botToken}/getFile?file_id=${fileRow.telegram_file_id}`,
				);
				const fileData: { ok: boolean; result?: { file_path: string } } = await fileRes.json();

				if (!fileData.ok || !fileData.result?.file_path) {
					return c.json({ success: false, error: "File unavailable on Telegram" }, 502);
				}

				// Stream the file from Telegram through us
				const tgResponse = await fetch(
					`${TG_API}/file/bot${botToken}/${fileData.result.file_path}`,
				);

				// Forward with correct headers for download
				const responseHeaders = new Headers(tgResponse.headers);
				responseHeaders.set(
					"Content-Disposition",
					`attachment; filename="${fileRow.file_name}"`,
				);
				responseHeaders.set("Content-Type", fileRow.mime_type || "application/octet-stream");
				responseHeaders.set("X-Pak-Hash", hash);
				responseHeaders.set("X-Pak-Downloads", String(row.downloads + 1));

				return new Response(tgResponse.body, {
					status: 200,
					headers: responseHeaders,
				});
			} catch {
				return c.json({ success: false, error: "Failed to proxy file" }, 502);
			}
		}
		// file_hash set but no files row — fall through to JSON
	}

	// ── No file attached → return JSON ──
	const pak: Record<string, unknown> = {
		...parsePak({
			...row,
			downloads: row.downloads + 1,
		} as { hash: string; data: string; downloads: number }),
	};

	if (row.file_hash) {
		const fileInfo = await getFileInfo(c.env.DB, row.file_hash);
		if (fileInfo) pak.file = fileInfo;
	}

	return c.json({ success: true, pak }, 200);
};
