import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';

import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler, ApiError } from './middleware/errorHandler.js';
import { createConflictsRouter } from './routes/conflicts.js';
import { createExportRouter } from './routes/export.js';
import { createUploadRouter } from './routes/upload.js';
import { SessionStore } from './services/sessionStore.js';

function createCorsOptions() {
  if (config.corsOrigin === '*') {
    return { origin: true };
  }

  return {
    origin: config.corsOrigin.split(',').map((origin) => origin.trim()),
  };
}

export function createApp(options = {}) {
  const app = express();
  const sessionStore = options.sessionStore || new SessionStore(options.sessionTtlMs || config.sessionTtlMs);
  const uploadLimitBytes = options.uploadLimitBytes || config.uploadLimitBytes;

  app.use(helmet());
  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: options.jsonLimit || config.jsonLimit }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('request completed', {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', environment: config.env });
  });

  app.use('/api', createUploadRouter({ sessionStore, uploadLimitBytes }));
  app.use('/api', createConflictsRouter({ sessionStore }));
  app.use('/api', createExportRouter({ sessionStore }));

  app.use((error, _req, _res, next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new ApiError(413, 'Uploaded file exceeds the configured size limit.', { limitBytes: uploadLimitBytes }, 'FILE_TOO_LARGE'));
      return;
    }

    next(error);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
