import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { handleTelegramWebhook } from "./telegram";

// Lanes (each exports route + handler)
import { route as pakCreateRoute, handler as pakCreateHandler } from "./endpoints/pakCreate";
import { route as pakListRoute, handler as pakListHandler } from "./endpoints/pakList";
import { route as pakFetchRoute, handler as pakFetchHandler } from "./endpoints/pakFetch";
import { route as pakDownloadRoute, handler as pakDownloadHandler } from "./endpoints/pakDownload";
import { route as pakAttachFileRoute, handler as pakAttachFileHandler } from "./endpoints/pakAttachFile";
import { route as pakByFileRoute, handler as pakByFileHandler } from "./endpoints/pakByFile";
import { route as pakUploadRoute, handler as pakUploadHandler } from "./endpoints/pakUpload";

const app = new OpenAPIHono<{ Bindings: Env }>();

// ── Global rate limiting — 100 requests/60s per path+IP (API only) ──
app.use("/api/*", async (c, next) => {
	const limiter = c.env.API_RATE_LIMITER as RateLimit;
	const { success } = await limiter.limit({
		key: c.req.path + ":" + (c.req.header("cf-connecting-ip") ?? "unknown"),
	});

	if (!success) {
		return c.json({ success: false, error: "Too many requests" }, 429);
	}

	await next();
});

// ── Global error handler ──
app.onError((err, c) => {
	console.error(err);
	return c.json({ success: false, error: "Internal server error" }, 500);
});

// ── Telegram bot webhook (raw Hono, no OpenAPI) ──
app.post("/webhook/telegram", async (c) => {
	const update = await c.req.json();
	c.executionCtx.waitUntil(handleTelegramWebhook(update, c.env as any));
	return c.text("OK");
});

// ── OpenAPI routes ──
app.openapi(pakCreateRoute, pakCreateHandler as any);
app.openapi(pakListRoute, pakListHandler as any);
app.openapi(pakFetchRoute, pakFetchHandler as any);
app.openapi(pakDownloadRoute, pakDownloadHandler as any);
app.openapi(pakAttachFileRoute, pakAttachFileHandler as any);
app.openapi(pakByFileRoute, pakByFileHandler as any);
app.openapi(pakUploadRoute, pakUploadHandler as any);

// ── OpenAPI documentation ──
app.doc("/openapi.json", {
	openapi: "3.0.0",
	info: { title: "dotapak API", version: "1.0.0" },
});

app.get("/", swaggerUI({ url: "/openapi.json" }));

export default app;
