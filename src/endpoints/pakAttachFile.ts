import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak } from "../types";

// Route definition
export const route = createRoute({
	method: "post",
	path: "/api/paks/:hash/file",
	tags: ["Paks"],
	summary: "Attach a file to an existing Pak",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						file_hash: z.string().regex(/^[a-f0-9]{32}$/).describe("File hash from Telegram bot"),
					}),
				},
			},
		},
	},
	responses: {
		"200": {
			description: "Returns the pak with attached file",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						pak: z.object({
							hash: z.string(),
							downloads: z.number().int(),
							file: z.object({
								hash: z.string(),
								file_name: z.string(),
								file_size: z.number().int(),
								mime_type: z.string(),
							}).optional(),
						}).passthrough(),
					}),
				},
			},
		},
		"404": {
			description: "Pak or file not found",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						error: z.string(),
					}),
				},
			},
		},
	},
});

// Handler
export const handler = async (c: Context<{ Bindings: Env }>) => {
	const { hash } = c.req.valid("param") as { hash: string };
	const { file_hash } = c.req.valid("json") as { file_hash: string };

	// Verify pak exists
	const pak = await c.env.DB.prepare(
		"SELECT hash, data, downloads, file_hash FROM paks WHERE hash = ?",
	)
		.bind(hash)
		.first<{ hash: string; data: string; downloads: number; file_hash: string }>();

	if (!pak) {
		return c.json({ success: false, error: "Pak not found" }, 404);
	}

	// Verify file exists
	const file = await c.env.DB.prepare(
		"SELECT hash, file_name, file_size, mime_type FROM files WHERE hash = ?",
	)
		.bind(file_hash)
		.first<{ hash: string; file_name: string; file_size: number; mime_type: string }>();

	if (!file) {
		return c.json({ success: false, error: "File not found. Upload it via Telegram bot first." }, 404);
	}

	// Attach file to pak
	await c.env.DB.prepare(
		"UPDATE paks SET file_hash = ?, updated_at = datetime('now') WHERE hash = ?",
	)
		.bind(file_hash, hash)
		.run();

	// Return updated pak with file info
	return c.json({
		success: true,
		pak: {
			...parsePak(pak),
			file: {
				hash: file.hash,
				file_name: file.file_name,
				file_size: file.file_size,
				mime_type: file.mime_type,
			},
		},
	}, 200);
};
