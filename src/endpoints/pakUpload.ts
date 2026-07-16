import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { hashBytes } from "../hash";
import { getFileInfo } from "../types";

export const route = createRoute({
	method: "post",
	path: "/api/paks/:hash/upload",
	tags: ["Paks"],
	summary: "Upload a file and attach it to a pak (forwards to Telegram)",
	request: {
		params: z.object({
			hash: z.string().regex(/^[a-f0-9]{32}$/).describe("Pak hash (32 hex chars)"),
		}),
	},
	responses: {
		"200": {
			description: "File uploaded and attached",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						file: z.object({
							hash: z.string(),
							file_name: z.string(),
							file_size: z.number().int(),
							mime_type: z.string(),
						}),
					}),
				},
			},
		},
		"400": { description: "Invalid input / missing file" },
		"404": { description: "Pak not found" },
		"502": { description: "Telegram upload failed" },
	},
});

export const handler = async (c: Context<{ Bindings: Env }>) => {
	const { hash } = (c.req.valid as (target: string) => { hash: string })("param");

	// Check pak exists
	const pak = await c.env.DB.prepare(
		"SELECT hash FROM paks WHERE hash = ?",
	).bind(hash).first<{ hash: string }>();
	if (!pak) {
		return c.json({ success: false, error: "Pak not found" }, 404);
	}

	// Parse multipart form
	const body = await c.req.parseBody();
	const fileField = body["file"];
	if (!fileField || typeof fileField === "string" || !(fileField instanceof File)) {
		return c.json({
			success: false,
			error: "No file uploaded. Send as multipart/form-data with field name 'file'",
		}, 400);
	}

	const file = fileField as File;
	const bytes = await file.arrayBuffer();
	const contentHash = await hashBytes(bytes);

	// File already stored? Just link it.
	const existing = await c.env.DB.prepare(
		"SELECT hash FROM files WHERE hash = ?",
	).bind(contentHash).first<{ hash: string }>();

	if (existing) {
		await c.env.DB.prepare(
			"UPDATE paks SET file_hash = ? WHERE hash = ?",
		).bind(contentHash, hash).run();

		const info = await getFileInfo(c.env.DB, contentHash);
		return c.json({ success: true, file: info }, 200);
	}

	// Need a chat_id to forward to Telegram
	const chatId = body["chat_id"] as string | undefined
		?? c.req.header("x-telegram-chat-id")
		?? c.env.TELEGRAM_CHAT_ID;

	if (!chatId) {
		return c.json({
			success: false,
			error: "No chat_id. Provide it in the form, X-Telegram-Chat-Id header, or set TELEGRAM_CHAT_ID env var. Message @userinfobot on Telegram to get yours.",
		}, 400);
	}

	// Send file to Telegram → get file_id
	const tgForm = new FormData();
	tgForm.append("chat_id", String(chatId));
	tgForm.append("document", new Blob([bytes], { type: file.type || "application/octet-stream" }), file.name);

	const tgRes = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/sendDocument`, {
		method: "POST",
		body: tgForm,
	});

	if (!tgRes.ok) {
		const err = await tgRes.text();
		return c.json({ success: false, error: "Telegram upload failed", details: err }, 502);
	}

	const tgData: any = await tgRes.json();
	const fileId = tgData?.result?.document?.file_id;
	if (!fileId) {
		return c.json({ success: false, error: "Telegram did not return a file_id" }, 502);
	}

	// Store in files table
	await c.env.DB.prepare(
		"INSERT OR IGNORE INTO files (hash, telegram_file_id, file_name, mime_type, file_size) VALUES (?, ?, ?, ?, ?)",
	).bind(contentHash, fileId, file.name, file.type || "", file.size).run();

	// Link to pak
	await c.env.DB.prepare(
		"UPDATE paks SET file_hash = ? WHERE hash = ?",
	).bind(contentHash, hash).run();

	return c.json({
		success: true,
		file: {
			hash: contentHash,
			file_name: file.name,
			file_size: file.size,
			mime_type: file.type || "application/octet-stream",
		},
	}, 200);
};
