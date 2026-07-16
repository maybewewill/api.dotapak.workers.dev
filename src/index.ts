import { fromHono } from "chanfana";
import { Hono } from "hono";
import { PakCreate } from "./endpoints/pakCreate";
import { PakList } from "./endpoints/pakList";
import { PakFetch } from "./endpoints/pakFetch";
import { PakDownload } from "./endpoints/pakDownload";

const app = new Hono<{ Bindings: Env }>();

// Global rate limiting — 100 requests per 60 seconds per path (API only)
app.use("/api/*", async (c, next) => {
	const limiter = c.env.API_RATE_LIMITER as RateLimit;
	const { success } = await limiter.limit({ key: c.req.path + ":" + (c.req.header("cf-connecting-ip") ?? "unknown") });

	if (!success) {
		return c.json({ success: false, error: "Too many requests" }, 429);
	}

	await next();
});

app.onError((err, c) => {
	console.error(err);
	return c.json({ success: false, error: "Internal server error" }, 500);
});

const openapi = fromHono(app, { docs_url: "/" });

// ── Paks ──
openapi.post("/api/paks", PakCreate);
openapi.get("/api/paks", PakList);
openapi.get("/api/paks/:hash", PakFetch);
openapi.post("/api/paks/:hash/download", PakDownload);

export default app;
