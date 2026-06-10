import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { metricsMiddleware, renderMetrics } from '../services/metrics.js';
import { query } from '../db/pool.js';
import redis from '../db/redis.js';

export const createApp = () => {
  // Sentry initialization skipped - not configured (SENTRY_DSN is empty)

  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(cors({
    origin: config.miniAppUrl,
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use('/uploads', express.static(config.storage.localDir));
  app.use(metricsMiddleware);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  app.use((req, res, next) => {
    logger.info(
      {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
      'Incoming request'
    );
    next();
  });

  app.get('/health', async (req, res) => {
    const checks: Record<string, string> = {};

    try {
      await query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((value) => value === 'ok');
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      config: {
        miniAppUrlHttps: config.miniAppUrl.startsWith('https://'),
        botTokenConfigured: Boolean(config.telegram.botToken),
      },
    });
  });

  app.get('/metrics', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(renderMetrics());
  });

  app.get('/api/info', (req, res) => {
    res.json({
      name: 'Creative Bot API',
      version: '0.1.0',
      env: config.env,
    });
  });

  return app;
};

export const installErrorHandlers = (app: express.Express) => {
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(err, 'Unhandled error');
    res.status(500).json({
      error: config.env === 'production' ? 'Internal server error' : err.message,
    });
  });
};
