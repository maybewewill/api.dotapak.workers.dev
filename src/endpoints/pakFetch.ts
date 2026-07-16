import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak, getFileInfo } from "../types";

// Route definition
export const route = createRoute({
	method: "get",
	path: "/api/paks/:hash",
	tags: ["Paks"],
	summary: "Get a single Pak by hash",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "Returns a single pak if found",
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
	},
});

// Handler
export const handler = async (c: Context<{ Bindings: Env }>) => {
	const { hash } = (c.req.valid as (target: string) => { hash: string })("param");

	const row = await c.env.DB.prepare(
		"SELECT hash, data, downloads, file_hash FROM paks WHERE hash = ?",
	)
		.bind(hash)
		.first<{ hash: string; data: string; downloads: number; file_hash: string }>();

	if (!row) {
		return c.json({ success: false, error: "Not found" }, 404);
	}

	const pak: Record<string, unknown> = { ...parsePak(row) };

	// Include file info if attached
	if (row.file_hash) {
		const fileInfo = await getFileInfo(c.env.DB, c.env.FILE_META, row.file_hash);
		if (fileInfo) pak.file = fileInfo;
	}

	return c.json({ success: true, pak }, 200);
};
