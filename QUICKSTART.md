# 🚀 Quick Start Guide

## Prerequisites
- **Docker & Docker Compose** installed
- **Telegram Bot Token** from @BotFather
- **Node.js 20+** (for local development without Docker)

## 1️⃣ Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env
```

**Required values in .env:**
```
TELEGRAM_BOT_TOKEN=123456789:ABCDefgh...    # From @BotFather
TELEGRAM_BOT_USERNAME=your_bot_name
TELEGRAM_SECRET_KEY=your_secret_from_botfather
MINI_APP_URL=https://your-public-https-url
```

Telegram Web App buttons only accept HTTPS URLs. For local frontend development,
expose `http://localhost:3001` through an HTTPS tunnel and set its public URL as
`MINI_APP_URL`. The frontend remains available directly at `http://localhost:3001`
in your browser.

## 2️⃣ Start Development Environment

```bash
# Start all services (PostgreSQL, Redis, MinIO, Backend, Frontend)
npm run dev

# Expected output:
# postgres_1   | database system is ready to accept connections
# redis_1      | * Ready to accept connections
# minio_1      | Listening on http://0.0.0.0:9000
# minio_1      | Listening on http://0.0.0.0:9001
# backend_1    | 📡 API server started on http://0.0.0.0:3000
# frontend_1   | VITE v5.0.8  ready in XXX ms
```

Takes ~30 seconds for all services to start and be healthy.

## 3️⃣ Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3001 | - |
| API | http://localhost:3000/health | - |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| PostgreSQL | localhost:5432 | creative_user / dev_password |
| Redis | localhost:6379 | - |

## 4️⃣ Initialize S3 Storage (MinIO)

1. Open http://localhost:9001 in browser
2. Login: `minioadmin` / `minioadmin`
3. Click "Create bucket" → name it `creatives`
4. Done!

## 5️⃣ Setup Telegram Bot

1. Open Telegram and find @BotFather
2. Send `/start`
3. Send `/newbot` 
4. Follow prompts to create bot
5. Copy bot token to `.env` as `TELEGRAM_BOT_TOKEN`
6. Copy bot username to `.env` as `TELEGRAM_BOT_USERNAME`

## 📊 Test API

```bash
# Check health
curl http://localhost:3000/health

# Get API info
curl http://localhost:3000/api/info

# List creatives (requires auth - coming soon)
curl http://localhost:3000/api/creatives
```

## 🔧 Common Commands

```bash
# View all logs
npm run dev:logs

# Stop all services
npm run dev:down

# Restart specific service
docker-compose -f docker-compose.dev.yml restart backend

# Access backend shell
docker-compose -f docker-compose.dev.yml exec backend sh

# Access database
docker-compose -f docker-compose.dev.yml exec postgres psql -U creative_user -d creative_bot

# View database schema
\dt              # in psql
\d creatives     # describe table
```

## 🐛 Troubleshooting

### ❌ "Port 3000 already in use"
```bash
lsof -i :3000
kill -9 <PID>
```

### ❌ "Cannot connect to PostgreSQL"
```bash
# Check if postgres is running
docker-compose -f docker-compose.dev.yml ps postgres

# View logs
docker-compose -f docker-compose.dev.yml logs postgres

# Restart
docker-compose -f docker-compose.dev.yml restart postgres
```

### ❌ "MinIO connection refused"
```bash
# MinIO might be initializing, wait 10-15 seconds and try again
# Or check logs:
docker-compose -f docker-compose.dev.yml logs minio
```

### ❌ "Changes not hot-reloading"
```bash
# Restart the affected service
docker-compose -f docker-compose.dev.yml restart backend
# or
docker-compose -f docker-compose.dev.yml restart frontend
```

## 📁 Project Structure

- **backend/** - Express API & Telegram Bot (Node.js)
- **frontend/** - React Mini App (TypeScript + Vite)
- **shared/** - Shared types for both backend & frontend
- **db/** - Database schema & migrations
- **docker-compose.dev.yml** - Development services

## 📚 Next Steps

1. ✅ Infrastructure setup ← **YOU ARE HERE**
2. 🔄 Set up authentication
3. 🔄 Build creative upload endpoint
4. 🔄 Implement search & filtering
5. 🔄 Create Telegram bot commands
6. 🔄 Build Mini App UI screens

## 📖 Documentation

- [Main README](./README.md)
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [Technical Specification](./TZ.md)

## 💡 Tips

- Use `npm run dev:logs` to debug issues
- Database is automatically initialized from `backend/db/init.sql`
- Frontend hot-reloads on save (Vite)
- Backend hot-reloads on save (tsx/nodemon)
- All services use Docker volumes for live code updates

## 🆘 Need Help?

1. Check logs: `npm run dev:logs`
2. Check README files in each folder
3. Read the full TZ documentation
4. Check .env file has correct values

---

**Ready to develop?** Check the README files for detailed development info!
