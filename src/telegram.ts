import { hashBytes } from "./hash";

const TG_API = "https://api.telegram.org";

interface Env {
	BOT_TOKEN: string;
	DB: D1Database;
}

// ── helpers ──

async function sendMessage(chatId: number | string, text: string, token: string) {
	await fetch(`${TG_API}/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
	});
}

async function downloadFile(fileId: string, token: string): Promise<{ bytes: ArrayBuffer; name: string }> {
	const fileRes = await fetch(`${TG_API}/bot${token}/getFile?file_id=${fileId}`);
	const data: any = await fileRes.json();
	const filePath: string = data.result.file_path;
	const name = filePath.split("/").pop() ?? "file";
	const dlRes = await fetch(`${TG_API}/file/bot${token}/${filePath}`);
	const bytes = await dlRes.arrayBuffer();
	return { bytes, name };
}

async function sendDocument(chatId: number | string, fileId: string, token: string) {
	await fetch(`${TG_API}/bot${token}/sendDocument`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, document: fileId }),
	});
}

// ── main handler ──

export async function handleTelegramWebhook(update: any, env: Env): Promise<Response> {
	const msg = update?.message;
	if (!msg) return new Response("OK");

	const chatId = msg.chat.id;
	const text = msg.text ?? "";
	const userId = String(msg.from?.id ?? "");

	// ══ Commands ══

	if (text.startsWith("/")) {
		if (text === "/start") {
			await sendMessage(chatId,
				"Send me any file and I'll store it.\n\n" +
				"`/get <hash>` — download a stored file",
				env.BOT_TOKEN,
			);
			return new Response("OK");
		}

		if (text.startsWith("/get ")) {
			const hash = text.slice(5).trim();
			if (!/^[a-f0-9]{32}$/.test(hash)) {
				await sendMessage(chatId, "Usage: `/get <32-char-hex-hash>`", env.BOT_TOKEN);
				return new Response("OK");
			}

			const row = await env.DB.prepare(
				"SELECT telegram_file_id FROM files WHERE hash = ?",
			).bind(hash).first<{ telegram_file_id: string }>();

			if (!row) {
				await sendMessage(chatId, "❌ File not found", env.BOT_TOKEN);
				return new Response("OK");
			}

			await sendDocument(chatId, row.telegram_file_id, env.BOT_TOKEN);
			return new Response("OK");
		}

		await sendMessage(chatId, "Unknown command. Try /start", env.BOT_TOKEN);
		return new Response("OK");
	}

	// ══ File upload ══

	// Pick the best file_id (photo → last = largest, otherwise document/video/audio)
	const fileId =
		msg.document?.file_id ??
		(msg.photo ? msg.photo.at(-1)?.file_id : undefined) ??
		msg.video?.file_id ??
		msg.audio?.file_id;

	if (!fileId) {
		await sendMessage(chatId, "Send me a file or use /start", env.BOT_TOKEN);
		return new Response("OK");
	}

	// Download file bytes once to compute content hash
	const file = await downloadFile(fileId, env.BOT_TOKEN);
	const hash = await hashBytes(file.bytes);

	// Check for duplicate
	const existing = await env.DB.prepare(
		"SELECT 1 FROM files WHERE hash = ?",
	).bind(hash).first();

	if (existing) {
		await sendMessage(chatId,
			`♻️ Already saved!\n\`${hash}\`\n/get \`${hash}\` to download`,
			env.BOT_TOKEN,
		);
		return new Response("OK");
	}

	// Store file_id in D1
	await env.DB.prepare(
		"INSERT INTO files (hash, telegram_file_id, file_name, mime_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)",
	).bind(
		hash,
		fileId,
		file.name,
		msg.document?.mime_type ?? "",
		msg.document?.file_size ?? file.bytes.byteLength,
		userId,
	).run();

	await sendMessage(chatId,
		`✅ File saved!\n\`${hash}\`\n/get \`${hash}\` to download`,
		env.BOT_TOKEN,
	);

	return new Response("OK");
}
