#!/bin/sh
set -eu

if [ -z "${DOMAIN:-}" ] || [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
  echo "DOMAIN and LETSENCRYPT_EMAIL are required"
  exit 1
fi

docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly \
  --webroot \
  -w /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"
