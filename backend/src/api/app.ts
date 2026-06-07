import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { metricsMiddleware, renderMetrics } from '../services/metrics.js';
import { query } from '../db/pool.js';
import redis from '../db/redis.js';

export const createApp = () => {
  if (config.sentry.dsn) {
    Sentry.init({
      dsn: config.sentry.dsn,
      environment: config.env,
      release: config.sentry.release,
      tracesSampleRate: config.env === 'production' ? 0.05 : 0,
    });
  }

  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.miniAppUrl,
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
    if (config.sentry.dsn) {
      Sentry.captureException(err);
    }

    logger.error(err, 'Unhandled error');
    res.status(500).json({
      error: config.env === 'production' ? 'Internal server error' : err.message,
    });
  });
};
