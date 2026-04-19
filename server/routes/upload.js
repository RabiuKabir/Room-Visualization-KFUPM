import express from 'express';
import multer from 'multer';

import {
  ApplySuggestionRequestSchema,
  AutoResolveRequestSchema,
  ConflictParamsSchema,
} from '../models/types.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { parseWorkbookBuffer } from '../services/excelParser.js';
import { applySuggestion, autoResolve } from '../services/resolver.js';
import { generateSuggestions } from '../services/suggestions.js';

function createUploadMiddleware(uploadLimitBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadLimitBytes },
    fileFilter: (_req, file, callback) => {
      const fileName = file.originalname.toLowerCase();
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xlsm')) {
        callback(new ApiError(415, 'Only .xlsx and .xlsm uploads are supported.', undefined, 'UNSUPPORTED_FILE_TYPE'));
        return;
      }

      callback(null, true);
    },
  });
}

export function createUploadRouter({ sessionStore, uploadLimitBytes }) {
  const router = express.Router();
  const upload = createUploadMiddleware(uploadLimitBytes);

  router.post(
    '/upload',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ApiError(400, 'An Excel file must be uploaded in the "file" field.', undefined, 'FILE_REQUIRED');
      }

      const parsed = await parseWorkbookBuffer(req.file.buffer);
      const session = sessionStore.create({
        fileName: req.file.originalname,
        originalBuffer: req.file.buffer,
        records: parsed.records,
        conflicts: parsed.conflicts,
        summary: parsed.summary,
        metadata: parsed.metadata,
      });

      res.status(201).json({
        success: true,
        sessionId: session.id,
        fileName: session.fileName,
        records: session.records,
        conflicts: session.conflicts,
        summary: session.summary,
        metadata: session.metadata,
      });
    }),
  );

  router.post(
    '/auto-resolve',
    validate(AutoResolveRequestSchema),
    asyncHandler(async (req, res) => {
      const session = sessionStore.get(req.body.sessionId);
      const result = autoResolve(session.records, {
        allowTimeShift: req.body.allowTimeShift,
        prioritizeLabs: req.body.prioritizeLabs,
      });

      const updatedSession = sessionStore.update(session.id, {
        records: result.records,
        conflicts: result.conflicts,
        summary: result.summary,
      });

      res.json({
        success: true,
        sessionId: updatedSession.id,
        records: updatedSession.records,
        conflicts: updatedSession.conflicts,
        summary: updatedSession.summary,
        resolvedCount: result.resolvedCount,
        unresolvedCount: result.unresolvedCount,
        resolutionLog: result.resolutionLog,
      });
    }),
  );

  router.post(
    '/apply-suggestion/:conflictId',
    validate(ConflictParamsSchema, 'params'),
    validate(ApplySuggestionRequestSchema),
    asyncHandler(async (req, res) => {
      const session = sessionStore.get(req.body.sessionId);
      const allowedSuggestions = generateSuggestions(session.records, session.conflicts, req.params.conflictId, {
        allowTimeShift: true,
      });
      const matchingSuggestion = allowedSuggestions.find((suggestion) => suggestion.id === req.body.suggestion.id);

      if (!matchingSuggestion) {
        throw new ApiError(
          400,
          'The supplied suggestion is not valid for the selected conflict.',
          undefined,
          'INVALID_SUGGESTION',
        );
      }

      const result = applySuggestion(
        session.records,
        session.conflicts,
        req.params.conflictId,
        matchingSuggestion,
      );

      const updatedSession = sessionStore.update(session.id, {
        records: result.records,
        conflicts: result.conflicts,
        summary: result.summary,
      });

      res.json({
        success: true,
        sessionId: updatedSession.id,
        records: updatedSession.records,
        conflicts: updatedSession.conflicts,
        summary: updatedSession.summary,
      });
    }),
  );

  return router;
}
