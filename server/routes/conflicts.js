import express from 'express';

import { ConflictParamsSchema, SuggestionsQuerySchema } from '../models/types.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireSessionId, validate } from '../middleware/validation.js';
import { generateSuggestions } from '../services/suggestions.js';

export function createConflictsRouter({ sessionStore }) {
  const router = express.Router();

  router.get(
    '/conflicts',
    requireSessionId,
    asyncHandler(async (req, res) => {
      const session = sessionStore.get(req.sessionId);

      res.json({
        success: true,
        sessionId: session.id,
        conflicts: session.conflicts,
        summary: session.summary,
      });
    }),
  );

  router.get(
    '/suggestions/:conflictId',
    requireSessionId,
    validate(ConflictParamsSchema, 'params'),
    validate(SuggestionsQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const session = sessionStore.get(req.sessionId);
      const suggestions = generateSuggestions(session.records, session.conflicts, req.params.conflictId, {
        allowTimeShift: req.query.allowTimeShift,
      });

      res.json({
        success: true,
        sessionId: session.id,
        conflictId: req.params.conflictId,
        suggestions,
      });
    }),
  );

  return router;
}
