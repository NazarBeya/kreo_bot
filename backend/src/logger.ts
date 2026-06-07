import { pino } from 'pino';
import { config } from './config.js';

const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    levelFirst: true,
    singleLine: false,
  },
});

export const logger = pino(
  {
    level: config.logLevel,
  },
  transport
);
