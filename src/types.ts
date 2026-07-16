import { z } from "zod";

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

/** Input accepts any JSON, but must include `data.heroes` for hash-based dedup. */
export const PakCreateInput = z.object({
	data: z.object({
		heroes: z.array(PakHeroForHash).min(1, "At least one hero required"),
	}).passthrough(),
}).passthrough();

/** Row shape returned from D1 */
export interface PakRow {
	hash: string;
	data: string;
	downloads: number;
	file_hash?: string;
}

/** Row shape from files table */
export interface FileRow {
	hash: string;
	telegram_file_id: string;
	file_name: string;
	mime_type: string;
	file_size: number;
}

/**
 * Look up file metadata from D1 and return a file object or null.
 */
export async function getFileInfo(db: D1Database, fileHash: string) {
	const file = await db.prepare(
		"SELECT hash, file_name, file_size, mime_type FROM files WHERE hash = ?",
	).bind(fileHash).first<FileRow>();

	if (!file) return null;

	return {
		hash: file.hash,
		file_name: file.file_name,
		file_size: file.file_size,
		mime_type: file.mime_type,
	};
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
