# Render Deployment

This is the temporary/free deployment path for a demo environment.

## What Runs On Render

- `creative-bot-backend`: Docker web service with the API and Telegram bot.
- `creative-bot-frontend`: static Mini App build.
- `creative-bot-db`: Render Postgres.
- `creative-bot-redis`: Render Key Value.

Object storage is not hosted on Render in this setup. By default, the application is configured to fall back to **local filesystem storage** (`STORAGE_DRIVER=local`) if S3 credentials are not configured, meaning you do not need an S3 provider to get started! 

> [!NOTE]
> Render's filesystem is ephemeral on the free tier (files are deleted when the container restarts). For persistent production use, it is highly recommended to configure an external S3-compatible bucket or attach a Render Disk to `/app/uploads`.

## Before Deploy (Optional S3 Configuration)

If you want to use persistent external storage, create an S3-compatible bucket, for example in Cloudflare R2, and configure the following storage values:

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=creatives
S3_REGION=auto
```

The bucket should exist before the first upload.

## Deploy With Blueprint

1. Push this repo to GitHub.
2. Open Render Dashboard.
3. Click **New** -> **Blueprint**.
4. Select this repository.
5. Render will read `render.yaml`.
6. Fill all `sync: false` environment variables.

Backend values:

```env
API_URL=https://creative-bot-backend.onrender.com
MINI_APP_URL=https://creative-bot-frontend.onrender.com
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/app/uploads
S3_ENDPOINT=...
S3_PUBLIC_URL=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=creatives
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

This setup is for demo/testing. Render free services can sleep after inactivity, so the bot may respond with a delay. For real team usage with video uploads, move to a VPS or paid Render services plus external object storage.
