import { closePool } from './pool.js';
import { ensureOperationalSchema } from './schema.js';
import { logger } from '../logger.js';

try {
  await ensureOperationalSchema();
  logger.info('Database migration completed');
  await closePool();
  process.exit(0);
} catch (error) {
  logger.error(error, 'Database migration failed');
  await closePool();
  process.exit(1);
}
