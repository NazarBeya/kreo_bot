# Backend - Express API & Telegram Bot

## Structure

```
src/
├── api/
│   ├── app.ts           # Express app setup
│   ├── routes/          # API endpoints
│   └── middleware/      # Auth, validation, etc.
├── bot/
│   ├── index.ts         # Bot setup
│   ├── handlers/        # Command handlers
│   └── scenes/          # Multi-step conversations
├── db/
│   ├── pool.ts          # PostgreSQL connection pool
│   ├── redis.ts         # Redis client
│   └── migrate.ts       # Migration runner
├── services/
│   ├── creative.ts      # Creative logic
│   ├── user.ts          # User management
│   ├── status.ts        # Status management
│   └── storage.ts       # S3 operations
├── middleware/
│   ├── auth.ts          # JWT auth
│   ├── telegram.ts      # Telegram validation
│   └── errors.ts        # Error handling
├── utils/
│   ├── hashing.ts       # File hashing
│   ├── validation.ts    # Input validation
│   └── logger.ts        # Logging
├── config.ts            # Configuration
├── logger.ts            # Pino logger
└── index.ts             # Entry point
```

## Getting Started

```bash
npm install
npm run dev
```

## API Endpoints (Planned)

### Authentication
- `POST /api/auth/verify` - Verify Telegram user

### Creatives
- `GET /api/creatives` - List creatives (with filters)
- `POST /api/creatives` - Upload creative
- `GET /api/creatives/:id` - Get creative details
- `PUT /api/creatives/:id` - Update creative

### Status
- `POST /api/status` - Set status for creative/GEO
- `GET /api/status/:creativeId` - Get status history

### Users
- `GET /api/users/me` - Current user info
- `GET /api/users` - List users (admin only)

### Admin
- `GET /api/admin/stats` - Dashboard stats
- `GET /api/admin/audit` - Audit log
- `GET /api/admin/downloads` - Download log

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=123456789:ABCDefgh...
TELEGRAM_SECRET_KEY=secret_key_for_validation
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=creatives
API_URL=http://localhost:3000
MINI_APP_URL=http://localhost:3001
JWT_SECRET=your-secret-key
```

## Telegram Bot Commands

```
/start - Show main menu
/help - Show help
/upload - Upload creative (direct)
/search - Search creatives
/settings - User settings
/admin - Admin panel (lead only)
```

## Development Tips

- Hot reload: Changes to `src/` files auto-reload
- Database: Run migrations with `npm run db:migrate`
- Seed data: `npm run db:seed`
- Logs: Check `docker-compose logs backend`
