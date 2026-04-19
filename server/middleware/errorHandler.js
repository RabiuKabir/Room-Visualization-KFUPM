import { logger } from '../logger.js';

export class ApiError extends Error {
  constructor(statusCode, message, details = undefined, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
}

export function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, undefined, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';

  if (statusCode >= 500) {
    logger.error('Unhandled request error', {
      method: req.method,
      url: req.originalUrl,
      code,
      stack: error.stack,
    });
  } else {
    logger.warn('Request failed', {
      method: req.method,
      url: req.originalUrl,
      code,
      message: error.message,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: error.message || 'Unexpected server error',
      details: error.details,
    },
  });
}
