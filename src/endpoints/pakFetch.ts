import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, parsePak } from "../types";

export class PakFetch extends OpenAPIRoute {
	schema = {
		tags: ["Paks"],
		summary: "Get a single Pak by hash",
		request: {
			params: z.object({
				hash: z.string().describe("Pak hash"),
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
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { hash } = data.params;

		const row = await c.env.DB.prepare(
			"SELECT hash, data, downloads FROM paks WHERE hash = ?",
		)
			.bind(hash)
			.first<{ hash: string; data: string; downloads: number }>();

		if (!row) {
			return c.json({ success: false, error: "Not found" }, 404);
		}

		return {
			success: true,
			pak: parsePak(row),
		};
	}
}
