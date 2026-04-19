import winston from 'winston';

import { config, isProduction } from './config.js';

const { combine, colorize, timestamp, errors, printf, json } = winston.format;

const developmentFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metadata = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${level}: ${stack || message}${metadata}`;
});

export const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: { service: 'room-assignment-conflict-resolver-api' },
  format: isProduction()
    ? combine(timestamp(), errors({ stack: true }), json())
    : combine(colorize(), timestamp(), errors({ stack: true }), developmentFormat),
  transports: [new winston.transports.Console()],
});
