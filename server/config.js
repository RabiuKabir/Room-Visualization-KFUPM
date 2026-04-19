import dotenv from 'dotenv';

dotenv.config();

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: readNumber(process.env.PORT, 4000),
  uploadLimitBytes: readNumber(process.env.UPLOAD_LIMIT_BYTES, 10 * 1024 * 1024),
  jsonLimit: process.env.JSON_LIMIT || '1mb',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  sessionTtlMs: readNumber(process.env.SESSION_TTL_MS, 60 * 60 * 1000),
};

export function isProduction() {
  return config.env === 'production';
}
