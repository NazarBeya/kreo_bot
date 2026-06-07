# Creative Bot - Architecture & Development Guide

## Overview

Creative Bot is a full-stack Telegram mini-app for managing dating vertical creatives. It provides a centralized database for media buying teams to organize, track, and collaborate on creative assets.

## Architecture

### Technology Stack

```
┌─────────────────────────────────────────┐
│         TELEGRAM USERS                  │
│     (Bot + Mini App Web View)          │
└──────────────┬──────────────────────────┘
               │
        ┌──────▼─────────┐
        │    TELEGRAM    │
        │     BOT API    │
        └──────┬─────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────┐          ┌─────▼──┐
│ Backend│          │Frontend│
│ Node.js│          │ React  │
│Express │          │+ Vite  │
│ grammy │          └────────┘
└───┬────┘
    │
    ├──► PostgreSQL 15 (Primary Database)
    ├──► Redis 7 (Cache & Queue)
    └──► S3 Storage (MinIO/Hetzner/B2/R2)
```

### Backend Architecture

```
src/
├── index.ts              # Application entry point
├── config.ts             # Configuration loader
├── logger.ts             # Logging setup (Pino)
│
├── api/
│   ├── app.ts           # Express app setup, middleware, error handling
│   ├── index.ts         # Route mounting
│   └── routes/          # API endpoints
│       ├── auth.ts      # Authentication
│       └── creatives.ts # Creative management
│
├── bot/
│   └── index.ts         # Telegram bot setup (grammy)
│       ├── commands     # /start, /help, /upload, etc.
│       └── handlers     # Conversation logic
│
├── db/
│   ├── pool.ts          # PostgreSQL connection pool
│   ├── redis.ts         # Redis client
│   └── [migrations]     # Database migrations
│
├── services/
│   ├── user.ts          # User management logic
│   ├── creative.ts      # Creative CRUD & search
│   ├── status.ts        # Status tracking
│   └── storage.ts       # S3/file operations
│
├── middleware/
│   ├── auth.ts          # JWT & Telegram auth
│   ├── validation.ts    # Input validation
│   └── errors.ts        # Error handling
│
└── utils/
    ├── crypto.ts        # File hashing, ID generation
    ├── validation.ts    # Data validation
    └── logger.ts        # Logging utilities
```

### Frontend Architecture

```
src/
├── main.tsx             # React entry point
├── App.tsx              # Root component
├── config.ts            # Environment config
├── api.ts               # API client setup
│
├── components/
│   ├── Header.tsx       # Top navigation
│   ├── TabBar.tsx       # Bottom tab navigation
│   ├── CreativeCard.tsx # Creative preview card
│   ├── FilterPanel.tsx  # Search filters
│   └── Modal/           # Modal components
│
├── pages/
│   ├── Catalog.tsx      # Browse creatives
│   ├── Upload.tsx       # Upload interface
│   ├── Search.tsx       # Search interface
│   ├── Creative.tsx     # Detail view
│   ├── Bookmarks.tsx    # Saved creatives
│   └── Admin.tsx        # Admin dashboard
│
└── stores/
    ├── creatives.ts     # Creative state (Zustand)
    ├── user.ts          # User state
    └── ui.ts            # UI state
```

### Database Schema

37 tables total covering:
- **Users & Auth**: users, notification_settings
- **Creatives**: creatives, creative_geos, creative_angles, creative_statuses
- **Social**: comments, bookmarks, subscriptions
- **Operations**: downloads, notifications, presets
- **Admin**: audit_log, reference_lists

Key relationships:
```
users (1) ──► (many) creatives (author_id)
        ├──► (many) creative_statuses (buyer_id)
        ├──► (many) downloads (user_id)
        ├──► (many) comments (author_id)
        └──► (many) bookmarks (user_id)

creatives (1) ──► (many) creative_geos
          ├──► (many) creative_angles
          ├──► (many) creative_statuses
          └──► (many) downloads
```

## Development Workflow

### Local Development

```bash
# 1. Start all services
npm run dev

# 2. Services start:
# - PostgreSQL (port 5432)
# - Redis (port 6379)
# - MinIO (ports 9000, 9001)
# - Backend (port 3000)
# - Frontend (port 5173)

# 3. Watch logs
npm run dev:logs

# 4. Access services
# API: http://localhost:3000
# Frontend: http://localhost:3001
# MinIO: http://localhost:9001
```

### Making Changes

**Backend:**
- Edit files in `backend/src/`
- Hot reload via tsx/nodemon
- Changes apply within seconds

**Frontend:**
- Edit files in `frontend/src/`
- Vite HMR for instant updates
- Changes visible in browser immediately

**Database:**
- Migrations auto-run on container startup
- For schema changes: edit `backend/db/init.sql`
- Restart container: `docker-compose restart postgres`

## API Endpoints

### Authentication
```
POST   /api/auth/verify       # Verify Telegram user
GET    /api/auth/me           # Get current user (requires auth)
```

### Creatives
```
GET    /api/creatives         # List/search creatives
POST   /api/creatives         # Upload creative
GET    /api/creatives/:id     # Get creative details
PUT    /api/creatives/:id     # Update creative
```

### Status
```
POST   /api/status            # Set status for creative/GEO
GET    /api/status/:id        # Get status history
```

### Users (Admin)
```
GET    /api/admin/users       # List users
PUT    /api/admin/users/:id   # Update user/role
POST   /api/admin/users/:id/block  # Block user
```

### Admin Dashboard
```
GET    /api/admin/stats       # Dashboard statistics
GET    /api/admin/audit       # Audit log
GET    /api/admin/downloads   # Download log
```

## Authentication Flow

1. **Mini App Launch**
   - Telegram passes `initData` to Mini App
   - Frontend sends initData to backend

2. **Verification**
   - Backend validates HMAC using bot token
   - Extracts `telegramId` and user info
   - Checks if user is whitelisted (team member)

3. **Token Generation**
   - Backend generates JWT token with user ID & role
   - Frontend stores token (sessionStorage)

4. **API Requests**
   - All API calls include JWT in Authorization header
   - Backend validates token & user permissions
   - Updates `last_active_at` timestamp

## File Upload Flow

1. **Frontend**
   - User selects file(s) via drag-drop or picker
   - Calculate file hash locally (sha-256)
   - Compress preview image locally

2. **Backend**
   - Receive multipart form data
   - Validate file (type, size, hash)
   - Check for duplicates by hash
   - Upload to S3 storage
   - Generate preview with watermark
   - Save metadata to database
   - Return creative ID to user

3. **Storage**
   - Original file: `/creatives/originals/{hash}.{ext}` (private)
   - Preview: `/creatives/previews/{id}-watermark.jpg` (private)
   - Access via signed URLs (15 min expiry)

## Deployment

### Development
- Docker Compose with hot reload
- All services as containers
- Persistent volumes for data

### Production
- See `DEPLOYMENT.md` for full checklist
- VPS or managed container service
- Let's Encrypt SSL certificate
- Nginx reverse proxy
- Automated backups
- Monitoring & logging

## Security Considerations

- **Authentication**: HMAC validation of Telegram initData
- **Authorization**: Role-based access control (buyer/lead/admin)
- **File Protection**: Watermarked previews, signed URLs for downloads
- **Input Validation**: Sanitization & type checking on all inputs
- **Rate Limiting**: Prevent abuse of upload/search endpoints
- **Audit Logging**: All critical operations logged
- **Data Protection**: Private S3 bucket, encrypted at rest

## Performance Optimization

- **Caching**: Redis for frequently accessed data
- **Database**: Indices on common query patterns
- **Frontend**: Code splitting, lazy loading, compression
- **Storage**: Compressed previews (1/3 size of original)
- **API**: Pagination (default 20 items per page)

## Environment Variables

```bash
# Telegram
TELEGRAM_BOT_TOKEN        # Bot token from @BotFather
TELEGRAM_BOT_USERNAME     # Bot username
TELEGRAM_SECRET_KEY       # For init data validation

# Database
DATABASE_URL              # PostgreSQL connection string
REDIS_URL                 # Redis connection string

# Storage
S3_ENDPOINT               # S3-compatible service URL
S3_ACCESS_KEY             # S3 access key
S3_SECRET_KEY             # S3 secret key
S3_BUCKET                 # S3 bucket name
S3_REGION                 # S3 region

# URLs
API_URL                   # Backend API URL
MINI_APP_URL              # Frontend URL

# Security
JWT_SECRET                # JWT signing key

# Other
NODE_ENV                  # development|production
LOG_LEVEL                 # info|debug|error
```

## Common Tasks

### Adding a New API Endpoint

1. Create route in `backend/src/api/routes/feature.ts`
2. Add handler function with validation
3. Mount in `backend/src/api/index.ts`
4. Add types to `shared/types.ts`
5. Create API client in `frontend/src/api.ts`
6. Use in React component

### Adding a New Database Table

1. Add table definition to `backend/db/init.sql`
2. Add indices as needed
3. Create service functions in `backend/src/services/`
4. Add types to `shared/types.ts`

### Adding a Telegram Bot Command

1. Add handler in `backend/src/bot/index.ts`
2. Register with `bot.command('name', handler)`
3. Add keyboard buttons/scenes for conversation flow

## Testing

```bash
# Backend tests
npm run test --workspace=backend

# Frontend tests
npm run test --workspace=frontend

# Type checking
npm run typecheck
```

## Monitoring & Debugging

```bash
# View all logs
npm run dev:logs

# View specific service logs
docker-compose -f docker-compose.dev.yml logs backend

# Follow logs in real-time
docker-compose -f docker-compose.dev.yml logs -f backend

# Database debugging
docker-compose -f docker-compose.dev.yml exec postgres psql -U creative_user -d creative_bot

# Redis debugging
docker-compose -f docker-compose.dev.yml exec redis redis-cli
```

## Project Timeline (MVP)

Based on 184-252 hour estimate:

- Week 1-2: Infrastructure & Auth (20-26h)
- Week 2-3: Database & Bot (20-28h)
- Week 3-4: Upload & Preview (16-22h)
- Week 4-5: Mini App UI (16-22h)
- Week 5-6: Catalog & Search (18-25h)
- Week 6-7: Creative Details & Status (30-41h)
- Week 7-8: Social Features (22-30h)
- Week 8: Admin Dashboard (18-24h)
- Week 8-9: Polish & Deploy (14-20h)

## Resources

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [grammy Framework](https://grammy.dev/)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Express.js](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [TailwindCSS](https://tailwindcss.com/)

## Support & Troubleshooting

See:
- `QUICKSTART.md` - Quick setup guide
- `DEPLOYMENT.md` - Deployment checklist
- `README.md` - Project overview
- `backend/README.md` - Backend details
- `frontend/README.md` - Frontend details

---

**Last Updated:** May 2026
**Version:** 0.1.0 (MVP Setup)
