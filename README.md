# Creative Bot - Development Environment

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Telegram Bot Token (get from @BotFather)

### 1. Setup Environment Variables

Create `.env` file in project root:

```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_SECRET_KEY=your_secret_key

# Database
DB_NAME=creative_bot
DB_USER=creative_user
DB_PASSWORD=secure_password_here

# S3 / MinIO
S3_ENDPOINT=https://your-s3-endpoint.com
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=creatives
S3_REGION=us-east-1

# URLs
API_URL=https://api.yourdomain.com
MINI_APP_URL=https://yourdomain.com/app
JWT_SECRET=your-jwt-secret-key-change-in-production

# Optional
NODE_ENV=development
LOG_LEVEL=info
```

### 2. Start Development Environment

```bash
# Start all services (PostgreSQL, Redis, MinIO, Backend, Frontend)
npm run dev

# View logs
npm run dev:logs

# Stop services
npm run dev:down
```

### 3. Access Services

- **Frontend (React Mini App)**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin / minioadmin)
- **PostgreSQL**: localhost:5432

### 4. Initialize MinIO Bucket

```bash
# Open MinIO console at http://localhost:9001
# Login: minioadmin / minioadmin
# Create bucket: creatives
```

## Project Structure

```
creative_bot/
├── backend/
│   ├── src/
│   │   ├── api/           # Express routes & middleware
│   │   ├── bot/           # Telegram bot logic
│   │   ├── db/            # Database & Redis connections
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Custom middleware
│   │   ├── utils/         # Utilities (hashing, validation, etc.)
│   │   ├── config.ts      # Configuration
│   │   ├── logger.ts      # Logging setup
│   │   └── index.ts       # Application entry point
│   ├── db/
│   │   └── init.sql       # Database schema
│   ├── Dockerfile.dev
│   ├── Dockerfile.prod
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── stores/        # Zustand stores
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile.dev
│   ├── Dockerfile.prod
│   ├── vite.config.ts
│   └── package.json
├── shared/
│   └── types/             # Shared TypeScript types
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── README.md
```

## Development Workflow

### Backend Development
- Source code is mounted as volume, hot-reload available
- Run migrations: `docker-compose exec backend npm run db:migrate`
- Access logs: `npm run dev:logs`

### Frontend Development
- Vite dev server with hot module replacement (HMR)
- Port 5173 is exposed for access

### Database
- PostgreSQL 15 running with persistent volume
- Schema initialized from `backend/db/init.sql`
- Access via `localhost:5432`

## Common Commands

```bash
# View all logs
npm run dev:logs

# Restart specific service
docker-compose -f docker-compose.dev.yml restart backend

# Access backend shell
docker-compose -f docker-compose.dev.yml exec backend sh

# Access database
docker-compose -f docker-compose.dev.yml exec postgres psql -U creative_user -d creative_bot
```

## Troubleshooting

### Port already in use
```bash
# Find process using port 3000
lsof -i :3000
# Kill process
kill -9 <PID>
```

### Database connection failed
```bash
# Check PostgreSQL is running
docker-compose -f docker-compose.dev.yml ps postgres

# View logs
docker-compose -f docker-compose.dev.yml logs postgres
```

### MinIO connection failed
```bash
# Create bucket via console: http://localhost:9001
# Or use AWS CLI:
# aws s3api create-bucket --bucket creatives --endpoint-url http://localhost:9000
```

## Production Deployment

For production:
1. Create `.env.prod` with secure values
2. Update `API_URL` and `MINI_APP_URL` to your domain
3. Use SSL certificates (Let's Encrypt)
4. Run: `npm run build && npm run prod`

## Support

For issues or questions, check the TZ documentation or contact the team.
