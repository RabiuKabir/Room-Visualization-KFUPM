import express from 'express';

import { ExportRequestSchema } from '../models/types.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { exportWorkbook } from '../services/excelExporter.js';

export function createExportRouter({ sessionStore }) {
  const router = express.Router();

  router.post(
    '/export',
    validate(ExportRequestSchema),
    asyncHandler(async (req, res) => {
      const session = sessionStore.get(req.body.sessionId);
      const exportResult = await exportWorkbook(
        session.originalBuffer,
        session.records,
        req.body.fileName || session.fileName,
        session.metadata,
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.fileName}"`);
      res.send(exportResult.buffer);
    }),
  );

  return router;
}
