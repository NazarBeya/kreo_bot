import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../logger.js';

const redis = new Redis(config.redis.url);

redis.on('error', (err: Error) => {
  logger.error(err, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

export default redis;
