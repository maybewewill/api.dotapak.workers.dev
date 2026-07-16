import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak } from "../types";

// Route definition
export const route = createRoute({
	method: "get",
	path: "/api/files/:file_hash/pak",
	tags: ["Paks"],
	summary: "Find a Pak by its attached file hash",
	request: {
		params: z.object({
			file_hash: z.string().regex(/^[a-f0-9]{32}$/).describe("File hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "Returns the pak if found",
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
			description: "No pak found with this file hash",
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
	const { file_hash } = c.req.valid("param") as { file_hash: string };

	const row = await c.env.DB.prepare(
		"SELECT hash, data, downloads, file_hash FROM paks WHERE file_hash = ?",
	)
		.bind(file_hash)
		.first<{ hash: string; data: string; downloads: number; file_hash: string }>();

	if (!row) {
		return c.json({ success: false, error: "No pak found with this file" }, 404);
	}

	return c.json({
		success: true,
		pak: parsePak(row),
	}, 200);
};
