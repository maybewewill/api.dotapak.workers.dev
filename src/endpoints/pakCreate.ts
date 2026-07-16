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
		const payload = JSON.stringify(input);

		// Reject oversized payloads before hitting D1's ~1MB bind limit
		if (payload.length >= 900_000) {
			return c.json({ success: false, error: "Payload too large (max ~900KB)" }, 413);
		}

		const hash = await generatePakHash(input);

		// Insert with hash check (atomic — avoids race condition on duplicate)
		const result = await c.env.DB.prepare(
			"INSERT OR IGNORE INTO paks (hash, data) VALUES (?, ?)",
		)
			.bind(hash, payload)
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

		return c.json(
			{
				success: true,
				pak: {
					...input,
					hash,
					downloads: 0,
				},
			},
			201,
		);
	}
}
