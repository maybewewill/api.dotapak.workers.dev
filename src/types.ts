import type { Context } from "hono";
import { z } from "zod";

export type AppContext = Context<{ Bindings: Env }>;

// ── Paks (flexible schema) ──

/** Minimal hero/slot shape needed for hash computation. Extra fields pass through. */
const PakHeroForHash = z.object({
	hero_id: z.number().int(),
	slots: z.array(
		z.object({
			slot: z.string(),
			item_id: z.number().int(),
		}).passthrough(),
	),
}).passthrough();

/** Input accepts any JSON, but must include `data.heroes` for hash-based dedup.
 * Max payload ~900KB to stay safely under D1's ~1MB parameter limit. */
export const PakCreateInput = z.object({
	data: z.object({
		heroes: z.array(PakHeroForHash).min(1, "At least one hero required"),
	}).passthrough(),
}).passthrough().refine(
	(val) => JSON.stringify(val).length < 900_000,
	{ message: "Payload too large (max ~900KB)" },
);

/** Row shape returned from D1 */
export interface PakRow {
	hash: string;
	data: string;
	downloads: number;
}

/** Response pak — hash + downloads + all user data spread at top level */
export function parsePak(row: PakRow) {
	let data: unknown;
	try {
		data = JSON.parse(row.data);
	} catch {
		throw new Error("Corrupted pak data for hash: " + row.hash);
	}
	return {
		hash: row.hash,
		downloads: row.downloads,
		...(typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {}),
	};
}
