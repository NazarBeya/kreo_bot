# Render Deployment

This is the temporary/free deployment path for a demo environment.

## What Runs On Render

- `creative-bot-backend`: Docker web service with the API and Telegram bot.
- `creative-bot-frontend`: static Mini App build.
- `creative-bot-db`: Render Postgres.
- `creative-bot-redis`: Render Key Value.

Object storage is not hosted on Render in this setup. Use Cloudflare R2, Backblaze B2, AWS S3, or another S3-compatible bucket.

## Before Deploy

Create an S3-compatible bucket, for example in Cloudflare R2.

Required storage values:

```env
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
