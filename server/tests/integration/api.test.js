import { describe, expect, test } from '@jest/globals';
import ExcelJS from 'exceljs';
import request from 'supertest';

import { createApp } from '../../app.js';
import { SessionStore } from '../../services/sessionStore.js';
import { buildConflictWorkbookBuffer, buildWorkbookBuffer } from '../helpers/workbookFactory.js';

function createTestApp(options = {}) {
  return createApp({
    sessionStore: new SessionStore(60_000),
    uploadLimitBytes: options.uploadLimitBytes,
  });
}

function binaryParser(response, callback) {
  response.setEncoding('binary');
  let data = '';
  response.on('data', (chunk) => {
    data += chunk;
  });
  response.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
}

describe('backend API', () => {
  test('supports upload, conflict inspection, suggestions, manual apply, and export', async () => {
    const app = createTestApp();
    const uploadBuffer = await buildConflictWorkbookBuffer();

    const uploadResponse = await request(app)
      .post('/api/upload')
      .attach('file', uploadBuffer, 'schedule.xlsx');

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.sessionId).toBeTruthy();
    expect(uploadResponse.body.conflicts.length).toBeGreaterThan(0);

    const { sessionId } = uploadResponse.body;
    const conflictId = uploadResponse.body.conflicts[0].id;

    const conflictsResponse = await request(app)
      .get('/api/conflicts')
      .set('x-session-id', sessionId);

    expect(conflictsResponse.status).toBe(200);
    expect(conflictsResponse.body.summary.uniqueConflictPairs).toBe(1);

    const suggestionsResponse = await request(app)
      .get(`/api/suggestions/${conflictId}`)
      .set('x-session-id', sessionId);

    expect(suggestionsResponse.status).toBe(200);
    expect(suggestionsResponse.body.suggestions.length).toBeGreaterThan(0);

    const applyResponse = await request(app)
      .post(`/api/apply-suggestion/${conflictId}`)
      .send({
        sessionId,
        suggestion: suggestionsResponse.body.suggestions[0],
      });

    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body.summary.uniqueConflictPairs).toBe(0);

    const exportResponse = await request(app)
      .post('/api/export')
      .buffer(true)
      .parse(binaryParser)
      .send({ sessionId });

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportResponse.body);
    const worksheet = workbook.worksheets[0];
    const headerValues = worksheet.getRow(3).values.map((value) => String(value || ''));
    expect(headerValues).toContain('Resolution Action');
  });

  test('supports auto-resolution for a valid upload', async () => {
    const app = createTestApp();
    const uploadBuffer = await buildConflictWorkbookBuffer();

    const uploadResponse = await request(app)
      .post('/api/upload')
      .attach('file', uploadBuffer, 'schedule.xlsx');

    const autoResolveResponse = await request(app)
      .post('/api/auto-resolve')
      .send({
        sessionId: uploadResponse.body.sessionId,
        allowTimeShift: false,
        prioritizeLabs: true,
      });

    expect(autoResolveResponse.status).toBe(200);
    expect(autoResolveResponse.body.resolvedCount).toBeGreaterThanOrEqual(1);
    expect(autoResolveResponse.body.summary.uniqueConflictPairs).toBe(0);
  });

  test('rejects malformed, empty, and oversized uploads', async () => {
    const invalidApp = createTestApp();
    const invalidResponse = await request(invalidApp)
      .post('/api/upload')
      .attach('file', Buffer.from('not-a-workbook'), 'broken.xlsx');

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe('INVALID_WORKBOOK');

    const emptyWorkbook = await buildWorkbookBuffer({
      headers: ['Subject', 'Number', 'Days', 'Start', 'End', 'Bldg', 'Room'],
      rows: [],
    });

    const emptyResponse = await request(invalidApp)
      .post('/api/upload')
      .attach('file', emptyWorkbook, 'empty.xlsx');

    expect(emptyResponse.status).toBe(400);
    expect(emptyResponse.body.error.code).toBe('NO_DATA_ROWS');

    const limitedApp = createTestApp({ uploadLimitBytes: 100 });
    const oversizedWorkbook = await buildConflictWorkbookBuffer();
    const oversizedResponse = await request(limitedApp)
      .post('/api/upload')
      .attach('file', oversizedWorkbook, 'too-large.xlsx');

    expect(oversizedResponse.status).toBe(413);
    expect(oversizedResponse.body.error.code).toBe('FILE_TOO_LARGE');
  });
});
