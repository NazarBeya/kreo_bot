import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

const pool = new pg.Pool({
  connectionString: config.database.url,
});

pool.on('error', (err: Error) => {
  logger.error(err, 'Unexpected error on idle client');
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
export const closePool = () => pool.end();

export default pool;
