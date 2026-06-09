#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-docker-compose.prod.yml}"

required_vars="
DOMAIN
LETSENCRYPT_EMAIL
DB_NAME
DB_USER
DB_PASSWORD
S3_ENDPOINT
S3_PUBLIC_URL
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_SECRET_KEY
API_URL
MINI_APP_URL
JWT_SECRET
"

for name in $required_vars; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required"
    exit 1
  fi
done

if command -v docker-compose >/dev/null 2>&1; then
  dc="docker-compose"
else
  dc="docker compose"
fi

$dc -f "$compose_file" config >/tmp/creative-bot-prod-compose.yml
$dc -f "$compose_file" build
$dc -f "$compose_file" up -d postgres redis minio backend frontend nginx

if ! $dc -f "$compose_file" run --rm --entrypoint certbot certbot certificates | grep -q "Domains: $DOMAIN"; then
  $dc -f "$compose_file" run --rm --entrypoint certbot certbot certonly \
    --webroot \
    -w /var/www/certbot \
    --email "$LETSENCRYPT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"
fi

$dc -f "$compose_file" restart nginx
$dc -f "$compose_file" up -d
$dc -f "$compose_file" exec -T backend npm run db:migrate

health_url="${API_URL%/}/health"
for attempt in $(seq 1 30); do
  if curl -fsS "$health_url" >/dev/null; then
    echo "Production deploy is healthy: $health_url"
    exit 0
  fi

  sleep 2
done

echo "Deploy finished but health check failed: $health_url"
exit 1
