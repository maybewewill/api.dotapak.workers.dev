import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { PakCreateInput, getFileInfo } from "../types";
import { generatePakHash } from "../hash";

// Route definition
export const route = createRoute({
	method: "post",
	path: "/api/paks",
	tags: ["Paks"],
	summary: "Create a new Pak",
	request: {
		body: {
			content: {
				"application/json": {
					schema: PakCreateInput,
				},
			},
		},
	},
	responses: {
		"201": {
			description: "Returns the created pak with generated hash",
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
		"409": {
			description: "Pak with this content already exists",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
						hash: z.string(),
					}),
				},
			},
		},
	},
});

// Handler
export const handler = async (c: Context<{ Bindings: Env }>) => {
	const input = (c.req.valid as (target: string) => Record<string, unknown>)("json");
	const payload = JSON.stringify(input);

	// Reject oversized payloads before hitting D1's ~1MB bind limit
	if (payload.length >= 900_000) {
		return c.json({ success: false, error: "Payload too large (max ~900KB)" }, 413);
	}

	// Extract optional file_hash from the flexible input, validate it
	const fileHash = typeof input.file_hash === "string" && /^[a-f0-9]{32}$/.test(input.file_hash as string)
		? (input.file_hash as string)
		: "";
	if (input.file_hash && !fileHash) {
		return c.json({ success: false, error: "Invalid file_hash format (expected 32 hex chars)" }, 400);
	}

	// If file_hash provided, verify file exists
	if (fileHash) {
		const file = await c.env.DB.prepare(
			"SELECT 1 FROM files WHERE hash = ?",
		).bind(fileHash).first();
		if (!file) {
			return c.json({ success: false, error: "File not found. Upload it via Telegram bot first." }, 404);
		}
	}

	const hash = await generatePakHash(input);

	// Insert with hash check (atomic — avoids race condition on duplicate)
	const result = await c.env.DB.prepare(
		"INSERT OR IGNORE INTO paks (hash, data, file_hash) VALUES (?, ?, ?)",
	)
		.bind(hash, payload, fileHash)
		.run();

	if (result.meta.changes === 0) {
		return c.json(
			{
				success: false,
				error: "Pak with this content already exists",
				hash,
			},
			409,
		);
	}

	// Build response — strip file_hash from spread data, add it as structured field
	const { file_hash: _, ...restInput } = input;
	const pak: Record<string, unknown> = { ...restInput, hash, downloads: 0 };
	if (fileHash) {
		const fileInfo = await getFileInfo(c.env.DB, c.env.FILE_META, fileHash);
		if (fileInfo) pak.file = fileInfo;
	}

	return c.json({ success: true, pak }, 201);
};
