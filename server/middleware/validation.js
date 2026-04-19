import { ZodError } from 'zod';

import { ApiError } from './errorHandler.js';

function toApiError(error) {
  if (error instanceof ZodError) {
    return new ApiError(
      400,
      'Validation failed',
      error.flatten(),
      'VALIDATION_ERROR',
    );
  }

  return error;
}

export function validate(schema, location = 'body') {
  return (req, _res, next) => {
    try {
      req[location] = schema.parse(req[location]);
      next();
    } catch (error) {
      next(toApiError(error));
    }
  };
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function resolveSessionId(req) {
  return (
    req.body?.sessionId ||
    req.query?.sessionId ||
    req.headers['x-session-id'] ||
    req.headers['x-sessionid'] ||
    null
  );
}

export function requireSessionId(req, _res, next) {
  const sessionId = resolveSessionId(req);

  if (!sessionId || typeof sessionId !== 'string') {
    next(new ApiError(400, 'A sessionId is required via body, query, or x-session-id header.', undefined, 'SESSION_ID_REQUIRED'));
    return;
  }

  req.sessionId = sessionId;
  next();
}
