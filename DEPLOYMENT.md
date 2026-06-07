# Deployment Checklist

## Pre-deployment Tasks

### Security
- [ ] Change all default passwords and tokens in `.env`
- [ ] Generate strong `JWT_SECRET`
- [x] HTTPS/TLS path is configured through `nginx` + `certbot` in `docker-compose.prod.yml`
- [x] CORS is restricted by `MINI_APP_URL`
- [x] API rate limiting is enabled in Express
- [ ] Set up host firewall rules for `80/443` only
- [x] Security headers are enabled through Helmet and Nginx

### Database
- [ ] Backup production database
- [ ] Run all migrations
- [ ] Verify indices are created
- [x] Daily Postgres backups are configured through `postgres-backup`
- [ ] Configure database user with minimal permissions

### Storage (S3)
- [ ] Create production S3 bucket
- [ ] Enable versioning on bucket
- [ ] Set up lifecycle policies (archive old files)
- [ ] Configure CORS for your domain
- [ ] Set up IAM user with minimal permissions
- [ ] Enable encryption at rest
- [x] Private object access uses signed URLs
- [x] Preview/download signed URL TTL is configurable with `SIGNED_PREVIEW_URL_TTL_SECONDS` and `SIGNED_DOWNLOAD_URL_TTL_SECONDS`
- [x] Daily MinIO volume backups are configured through `minio-backup`

### Telegram Bot
- [ ] Get production bot token from @BotFather
- [ ] Set webhook URL instead of polling
- [ ] Configure allowed IPs/domains
- [ ] Test all bot commands

### Monitoring & Logging
- [x] Sentry error tracking is wired through `SENTRY_DSN`
- [x] Prometheus metrics are exposed on `/metrics`
- [x] Loki + Promtail centralized logging is configured in `docker-compose.prod.yml`
- [ ] Set up uptime monitoring
- [ ] Configure alerts for critical errors

### Infrastructure
- [ ] Choose hosting (VPS, managed container service)
- [ ] Configure DNS records
- [ ] Set up SSL certificate
- [ ] Configure reverse proxy (Nginx)
- [ ] Set up CDN for static assets (optional)

## Deployment Steps

### 1. Build Docker Images
```bash
npm run build
```

### 2. Push to Registry
```bash
docker tag creative-bot-backend:latest your-registry/creative-bot-backend:latest
docker push your-registry/creative-bot-backend:latest

docker tag creative-bot-frontend:latest your-registry/creative-bot-frontend:latest
docker push your-registry/creative-bot-frontend:latest
```

### 3. Deploy to Production
```bash
# Using docker-compose on VPS
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Run Migrations
```bash
docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate
```

### 5. Verify Deployment
```bash
# Check services
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Test health endpoint
curl https://your-domain.com/health
```

## Post-deployment

- [ ] Monitor logs for errors
- [ ] Test all functionality
- [x] Automated backups are part of `docker-compose.prod.yml`
- [ ] Configure Sentry/Prometheus/Loki alerts
- [ ] Document deployment process
- [ ] Set up CI/CD pipeline

## Production Runtime Settings

```bash
DOMAIN=your-domain.com
LETSENCRYPT_EMAIL=admin@your-domain.com
API_URL=https://your-domain.com
MINI_APP_URL=https://your-domain.com
SENTRY_DSN=https://...
SIGNED_PREVIEW_URL_TTL_SECONDS=900
SIGNED_DOWNLOAD_URL_TTL_SECONDS=900
DOWNLOAD_LOG_RETENTION_DAYS=365
BACKUP_RETENTION_DAYS=30
```

Issue the first certificate after DNS points to the host:

```bash
sh infra/certbot/issue-initial-cert.sh
docker-compose -f docker-compose.prod.yml up -d
```

## Rollback Plan

In case of issues:

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Switch to previous version
docker-compose -f docker-compose.prod.yml up -d --pull never

# Restore database from backup if needed
pg_restore -d creative_bot backup.dump
```

## Performance Optimization

- [ ] Enable Nginx caching for static assets
- [ ] Configure Redis for session/cache
- [ ] Optimize database queries
- [ ] Set up connection pooling
- [ ] Enable gzip compression
- [ ] Configure database query caching

## Scaling Strategy (Future)

- Load balance API behind Nginx/HAProxy
- Run multiple backend instances
- Use managed PostgreSQL service
- Use managed Redis service
- Use CDN for static content
- Implement horizontal scaling

---

See `README.md` for more information.
