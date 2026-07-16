import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { hashBytes } from "../hash";
import { getFileInfo } from "../types";

export const route = createRoute({
	method: "post",
	path: "/api/paks/:hash/upload",
	tags: ["Paks"],
	summary: "Upload a file and attach it to a pak (stored in R2)",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "File uploaded and attached",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						file: z.object({
							hash: z.string(),
							file_name: z.string(),
							file_size: z.number().int(),
							mime_type: z.string(),
						}),
					}),
				},
			},
		},
		"400": { description: "Invalid input / missing file" },
		"404": { description: "Pak not found" },
	},
});

export const handler = async (c: Context<{ Bindings: Env }>) => {
	const { hash } = (c.req.valid as (target: string) => { hash: string })("param");

	// Check pak exists
	const pak = await c.env.DB.prepare(
		"SELECT hash FROM paks WHERE hash = ?",
	).bind(hash).first<{ hash: string }>();
	if (!pak) {
		return c.json({ success: false, error: "Pak not found" }, 404);
	}

	// Parse multipart form
	const body = await c.req.parseBody();
	const fileField = body["file"];
	if (!fileField || typeof fileField === "string" || !(fileField instanceof File)) {
		return c.json({
			success: false,
			error: "No file uploaded. Send as multipart/form-data with field name 'file'",
		}, 400);
	}

	const file = fileField as File;
	const bytes = await file.arrayBuffer();

	// Compute content hash (dedup key)
	const contentHash = await hashBytes(bytes);

	// Check if file already exists in R2 — just link it
	const existing = await c.env.FILES_BUCKET.head(contentHash);
	if (existing) {
		await c.env.DB.prepare(
			"UPDATE paks SET file_hash = ? WHERE hash = ?",
		).bind(contentHash, hash).run();

		const info = await getFileInfo(c.env.DB, c.env.FILE_META, contentHash);
		return c.json({ success: true, file: info }, 200);
	}

	// Store in R2 with hash as key
	await c.env.FILES_BUCKET.put(contentHash, bytes, {
		httpMetadata: {
			contentType: file.type || "application/octet-stream",
			contentDisposition: `attachment; filename="${file.name}"`,
		},
	});

	// Store file metadata in R2
	await c.env.FILE_META.put(`file:${contentHash}`, JSON.stringify({
		file_name: file.name,
		file_size: file.size,
		mime_type: file.type || "application/octet-stream",
	}));

	// Store metadata in files table
	await c.env.DB.prepare(
		"INSERT OR IGNORE INTO files (hash, telegram_file_id, file_name, mime_type, file_size) VALUES (?, '', ?, ?, ?)",
	).bind(contentHash, file.name, file.type || "", file.size).run();

	// Link to pak
	await c.env.DB.prepare(
		"UPDATE paks SET file_hash = ? WHERE hash = ?",
	).bind(contentHash, hash).run();

	return c.json({
		success: true,
		file: {
			hash: contentHash,
			file_name: file.name,
			file_size: file.size,
			mime_type: file.type || "application/octet-stream",
		},
	}, 200);
};
