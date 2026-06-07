<!-- GitHub Copilot Workspace Instructions -->

# Creative Bot - Telegram Bot for Managing Creatives

## Project Overview

This is a full-stack Telegram mini-app for internal media buying team to manage dating vertical creatives. 

**Tech Stack:**
- Backend: Node.js (Express + grammy)
- Frontend: React 18 + TypeScript + Vite
- Database: PostgreSQL 15
- Cache: Redis 7
- Storage: S3-compatible (MinIO, Hetzner, B2, R2)
- Container: Docker + Docker Compose

## Development Setup

### Quick Start
```bash
# 1. Copy environment template
cp .env.example .env

# 2. Fill in Telegram credentials in .env
# Get bot token from @BotFather on Telegram

# 3. Start all services
npm run dev

# 4. Access services:
# - Frontend: http://localhost:3001
# - API: http://localhost:3000
# - MinIO console: http://localhost:9001
```

### Services

- **PostgreSQL**: Database at localhost:5432
- **Redis**: Cache at localhost:6379
- **MinIO**: Object storage at localhost:9000 (console: 9001)
- **Backend**: Express API at localhost:3000
- **Frontend**: React Mini App at localhost:5173

## Project Structure

```
creative_bot/
├── backend/              # Express API + Telegram Bot
│   ├── src/
│   │   ├── api/         # Express routes
│   │   ├── bot/         # Telegram bot handlers
│   │   ├── db/          # Database & Redis
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Auth & validation
│   │   └── utils/       # Utilities
│   └── db/
│       └── init.sql     # Database schema
├── frontend/            # React Mini App
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page routes
│   │   ├── stores/      # Zustand state
│   │   └── api.ts       # API client
├── shared/              # Shared TypeScript types
└── docker-compose.dev.yml
```

## Key Features (MVP)

- [x] Database schema with all tables
- [x] Docker setup for development
- [x] Express API scaffold
- [x] Telegram bot scaffold
- [x] React frontend scaffold
- [x] Authentication framework (to implement)
- [ ] Creative upload endpoint
- [ ] Search & filtering
- [ ] Status management
- [ ] Comments & bookmarks
- [ ] Admin dashboard
- [ ] Notifications

## Database Schema

Key tables:
- `users` - Team members with roles
- `creatives` - Media files with metadata
- `creative_geos` - GEO targeting (M:N)
- `creative_angles` - Categories/angles (M:N)
- `creative_statuses` - Per-buyer status tracking
- `downloads` - Audit log
- `comments` - Discussion threads
- `subscriptions` - Alert preferences

## Development Workflow

### Backend
```bash
# Hot reload enabled - edit src/ files and changes auto-apply
npm run dev

# Database operations
npm run db:migrate
npm run db:seed

# Lint
npm run lint
```

### Frontend
```bash
# Vite dev server with HMR
npm run dev

# Build for production
npm run build
```

### Database
```bash
# Connect to PostgreSQL
docker-compose -f docker-compose.dev.yml exec postgres psql -U creative_user -d creative_bot

# View logs
npm run dev:logs
```

## Important Notes

1. **Telegram Bot Setup**:
   - Get token from @BotFather: /newbot
   - Set webhook later (production)
   - For development: use polling (default)

2. **Mini App Integration**:
   - Runs inside Telegram as Web App
   - Uses `Telegram.WebApp` API
   - Authentication via `initData` HMAC validation

3. **File Storage**:
   - Local development: MinIO (Docker)
   - Production: Any S3-compatible service (Hetzner, B2, R2, etc.)
   - Original files in private bucket with signed URLs

4. **Authentication**:
   - Telegram ID-based (whitelist)
   - Mini App auth via HMAC validation
   - JWT tokens for API requests

## Common Issues & Fixes

**Port 3000/5173 already in use**
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill it
```

**Database connection failed**
```bash
docker-compose -f docker-compose.dev.yml logs postgres
```

**MinIO bucket not found**
- Visit http://localhost:9001
- Login: minioadmin / minioadmin
- Create bucket: creatives

**Changes not hot-reloading**
- Check volumes in docker-compose.dev.yml
- Restart service: `docker-compose restart backend`

## Next Steps

1. ✅ Infrastructure & project setup
2. 🔄 User authentication (Telegram + JWT)
3. 🔄 Creative upload endpoint
4. 🔄 Search & filtering queries
5. 🔄 File processing (preview generation, watermarking)
6. 🔄 Status management logic
7. 🔄 Telegram bot commands
8. 🔄 Mini App UI screens
9. 🔄 Notifications system
10. 🔄 Admin dashboard

## Useful Commands

```bash
# View all logs
npm run dev:logs

# Restart backend
docker-compose -f docker-compose.dev.yml restart backend

# Access backend terminal
docker-compose -f docker-compose.dev.yml exec backend sh

# Clear Docker
docker-compose -f docker-compose.dev.yml down -v

# Production build & deploy
npm run build
npm run prod
```

## Documentation

- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [Shared Types](./shared/README.md)
- [Full TZ](./TZ.md) - Technical specification

---

**Questions?** Check the README files or TZ documentation.
