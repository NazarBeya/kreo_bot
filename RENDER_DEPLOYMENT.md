# Render Deployment

This is the temporary/free deployment path for a demo environment.

## What Runs On Render

- `creative-bot-backend`: Docker web service with the API and Telegram bot.
- `creative-bot-frontend`: static Mini App build.
- `creative-bot-db`: Render Postgres.
- `creative-bot-redis`: Render Key Value.

Media files (images, videos, previews) are stored in **Supabase Storage** via its S3-compatible API (`STORAGE_DRIVER=s3`).

## Supabase Storage Setup

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Storage** → **New bucket** → name: `creatives` → **Private** (the backend serves files through the API with auth/watermarks).
3. **Project Settings** → **Storage** → enable **S3 protocol** → **Generate S3 access keys**.
4. Copy **Endpoint**, **Region**, **Access Key ID**, and **Secret Access Key**.

Use these values in Render (`creative-bot-backend` environment):

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public
S3_ACCESS_KEY=<access-key-id>
S3_SECRET_KEY=<secret-access-key>
S3_BUCKET=creatives
S3_REGION=<region-from-supabase-settings>
```

Notes:

- `S3_REGION` must match the region shown in Supabase S3 settings (not `auto`).
- The bucket must exist before the first upload.
- Old creatives uploaded to Render local disk before this change are **not** migrated automatically — re-upload if needed.

## Deploy With Blueprint

1. Push this repo to GitHub.
2. Open Render Dashboard.
3. Click **New** → **Blueprint**.
4. Select this repository.
5. Render will read `render.yaml`.
6. Fill all `sync: false` environment variables (including Supabase S3 keys).

Backend values:

```env
API_URL=https://creative-bot-backend.onrender.com
MINI_APP_URL=https://creative-bot-frontend.onrender.com
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://<project-ref>.supabase.co/storage/v1/object/public
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=creatives
S3_REGION=eu-central-1
SENTRY_DSN=
```

Frontend values:

```env
VITE_API_URL=https://creative-bot-backend.onrender.com
VITE_BOT_USERNAME=<bot_username_without_@>
```

If Render gives different service URLs, use the actual URLs from the service pages.

The Blueprint includes a SPA rewrite rule (`/*` → `/index.html`) so `/admin` and other client routes work on the static frontend. Without it, Render returns a host-level `Not Found` before React loads.

If `/admin` still returns `Not Found` after a Blueprint sync, open `creative-bot-frontend` → **Redirects/Rewrites** and confirm this rule exists:

| Source | Destination | Action |
|--------|-------------|--------|
| `/*` | `/index.html` | Rewrite |

## Bot Delivery On Render

In production the backend uses a **Telegram webhook** (`POST /telegram/webhook`), not long polling. This avoids conflicts when local Docker was running with the same bot token.

Required backend env:

```env
API_URL=https://creative-bot-backend.onrender.com
```

After deploy, health should report `"botMode": "webhook"` and Telegram webhook info should point to the backend URL.

## After Deploy

Check backend health:

```bash
curl https://creative-bot-backend.onrender.com/health
```

Open the Mini App URL:

```text
https://creative-bot-frontend.onrender.com
```

Set the Mini App URL in Telegram/BotFather to the frontend URL.

## Free Tier Notes

This setup is for demo/testing. Render free services can sleep after inactivity, so the bot may respond with a delay. Supabase free tier includes 1 GB storage — enough for early testing.
