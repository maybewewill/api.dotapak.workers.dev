/**
 * Deeply sort a value for deterministic hashing:
 * - Objects: keys sorted alphabetically, values recursively sorted
 * - Arrays: elements sorted by their JSON representation
 * - Primitives: returned as-is
 */
function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		const sorted = value.map(sortValue);
		sorted.sort((a, b) => {
			const sa = JSON.stringify(a);
			const sb = JSON.stringify(b);
			return sa < sb ? -1 : sa > sb ? 1 : 0;
		});
		return sorted;
	}
	if (value !== null && typeof value === "object") {
		const keys = Object.keys(value as Record<string, unknown>).sort();
		const result: Record<string, unknown> = {};
		for (const key of keys) {
			result[key] = sortValue((value as Record<string, unknown>)[key]);
		}
		return result;
	}
	return typeof value === "string" ? value.normalize("NFC") : value;
}

/**
 * Generate a deterministic hash from any data object.
 * Normalises (sorts keys/elements) so equivalent content
 * produces the same hash regardless of field/array ordering.
 */
export async function generatePakHash(data: unknown): Promise<string> {
	const normalized = sortValue(data);
	const input = JSON.stringify(normalized);
	const hashBuffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Hash a client IP for privacy-preserving rate limiting.
 */
export async function hashIP(ip: string): Promise<string> {
	const hashBuffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(ip),
	);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
