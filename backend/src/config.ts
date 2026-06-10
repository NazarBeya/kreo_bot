import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://creative_user:dev_password@localhost:5432/creative_bot',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    publicUrl: process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'creatives',
    region: process.env.S3_REGION || 'us-east-1',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 
      (process.env.NODE_ENV === 'production' && (!process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY === 'minioadmin') ? 'local' : 's3'),
    localDir: process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), 'uploads'),
  },

  signedUrls: {
    previewTtlSeconds: parseInt(process.env.SIGNED_PREVIEW_URL_TTL_SECONDS || '900', 10),
    downloadTtlSeconds: parseInt(process.env.SIGNED_DOWNLOAD_URL_TTL_SECONDS || '900', 10),
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    secretKey: process.env.TELEGRAM_SECRET_KEY || '',
  },
  
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  miniAppUrl: process.env.MINI_APP_URL || 'http://localhost:3001',
  
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  
  logLevel: process.env.LOG_LEVEL || 'info',

  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version || '0.1.0',
  },

  operations: {
    downloadLogRetentionDays: parseInt(process.env.DOWNLOAD_LOG_RETENTION_DAYS || '365', 10),
  },
};
