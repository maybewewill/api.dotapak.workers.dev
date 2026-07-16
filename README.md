# dotapak API

Flexible JSON storage API for pak files. Built on Cloudflare Workers + D1.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/paks` | Create a pak. Accepts arbitrary JSON. Returns `{ hash, hash, downloads, ...data }`. |
| GET | `/api/paks` | List paks (paginated, 50/page). Optional filters: `?creator=`, `?creator_url=`. |
| GET | `/api/paks/:hash` | Fetch a single pak by hash. |
| POST | `/api/paks/:hash/download` | Increment download counter. Rate limited to once per 15s per IP. |

## Hash

Pak identity is a SHA-256 hash of the entire JSON content (normalized — keys sorted, arrays sorted). Duplicate content returns the same hash (409 on second POST).

## Deploy

```bash
npm install
npx wrangler deploy
```

Requires a D1 database named `api-db` and a rate limiter namespace. See `wrangler.jsonc` for bindings.
