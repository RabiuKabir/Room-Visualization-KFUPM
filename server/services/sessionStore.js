import { randomUUID } from 'node:crypto';

import { ApiError } from '../middleware/errorHandler.js';

export class SessionStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.ttlMs) {
        this.sessions.delete(sessionId);
      }
    }
  }

  create(payload) {
    this.pruneExpired();
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...payload,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId) {
    this.pruneExpired();
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ApiError(404, `Session '${sessionId}' was not found or has expired.`, undefined, 'SESSION_NOT_FOUND');
    }

    session.updatedAt = Date.now();
    return session;
  }

  update(sessionId, updater) {
    const current = this.get(sessionId);
    const next = typeof updater === 'function' ? updater(current) : updater;
    const updated = {
      ...current,
      ...next,
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  clear() {
    this.sessions.clear();
  }
}
