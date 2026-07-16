import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, PakCreateInput } from "../types";
import { generatePakHash } from "../hash";

export class PakCreate extends OpenAPIRoute {
	schema = {
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
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const input = data.body;

		const hash = await generatePakHash(input.data);

		// Check if hash already exists
		const existing = await c.env.DB.prepare(
			"SELECT hash FROM paks WHERE hash = ?",
		)
			.bind(hash)
			.first<{ hash: string }>();

		if (existing) {
			return c.json(
				{
					success: false,
					error: "Pak with this content already exists",
					hash,
				},
				409,
			);
		}

		// Store the full input JSON as `data`
		await c.env.DB.prepare(
			"INSERT INTO paks (hash, data) VALUES (?, ?)",
		)
			.bind(hash, JSON.stringify(input))
			.run();

		return c.json(
			{
				success: true,
				pak: {
					hash,
					downloads: 0,
					...input,
				},
			},
			201,
		);
	}
}
