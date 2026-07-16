import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { parsePak } from "../types";

// Route definition
export const route = createRoute({
	method: "get",
	path: "/api/paks",
	tags: ["Paks"],
	summary: "List all Paks",
	request: {
		query: z.object({
			page: z.coerce.number().int().min(0).default(0).describe("Page number"),
			creator: z.string().optional().describe("Filter by creator"),
			creator_url: z.string().optional().describe("Filter by creator_url"),
		}),
	},
	responses: {
		"200": {
			description: "Returns a list of paks",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						paks: z.array(
							z.object({
								hash: z.string(),
								downloads: z.number().int(),
							}).passthrough(),
						),
					}),
				},
			},
		},
	},
});

// Handler
export const handler = async (c: Context<{ Bindings: Env }>) => {
	const query = c.req.valid("query");
	const { creator, creator_url } = query;
	const page = isNaN(query.page) ? 0 : query.page;
	const pageSize = 50;
	const offset = page * pageSize;

	// Dynamic WHERE — filter by creator/creator_url via json_extract
	const bindings: unknown[] = [];
	let where = "";

	if (creator) {
		where += " AND json_extract(data, '$.data.creator') = ?";
		bindings.push(creator);
	}
	if (creator_url) {
		where += " AND json_extract(data, '$.data.creator_url') = ?";
		bindings.push(creator_url);
	}

	bindings.push(pageSize, offset);

	const { results } = await c.env.DB.prepare(
		"SELECT hash, data, downloads FROM paks WHERE 1=1" +
			where +
			" ORDER BY created_at_db DESC LIMIT ? OFFSET ?",
	)
		.bind(...bindings)
		.all<{ hash: string; data: string; downloads: number }>();

	return c.json({
		success: true,
		paks: (results ?? []).map(parsePak),
	}, 200);
};
