# Room Assignment Conflict Resolver

This project now includes a production-oriented Node.js/Express backend that extracts the scheduling business logic from the React client into testable server modules.

## What the backend does

- Parses uploaded Excel workbooks with flexible header detection and column mapping
- Normalizes day strings into `U/M/T/W/R/F/S`
- Parses times from `HH:MM`, `HHMM`, AM/PM strings, and Excel serial values
- Detects room conflicts with occupancy maps
- Auto-resolves conflicts by moving classes across available rooms and optional time shifts
- Generates diverse manual suggestions for a selected conflict
- Exports the updated workbook with a `Resolution Action` column

## Project structure

```text
server/
  routes/
    upload.js
    conflicts.js
    export.js
  services/
    excelParser.js
    conflictDetector.js
    resolver.js
    suggestions.js
    excelExporter.js
    sessionStore.js
    scheduleUtils.js
  models/
    types.js
    types.d.ts
  middleware/
    validation.js
    errorHandler.js
  tests/
    helpers/
    unit/
    integration/
  app.js
  server.js
```

## Setup

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` if you want custom backend configuration.
3. Start the frontend:
   `npm run dev`
4. Start the backend:
   `npm run server:dev`

The API defaults to `http://localhost:4000`.

## Environment variables

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
UPLOAD_LIMIT_BYTES=10485760
JSON_LIMIT=1mb
SESSION_TTL_MS=3600000
LOG_LEVEL=info
```

## API overview

The backend keeps workbook state in an in-memory session store. `POST /api/upload` returns a `sessionId`, and every later request must send that session ID in either the JSON body, query string, or `x-session-id` header.

### `POST /api/upload`

Multipart form-data:

- `file`: `.xlsx` or `.xlsm`

Example:

```bash
curl -X POST http://localhost:4000/api/upload \
  -F "file=@Schedule.xlsx"
```

Response shape:

```json
{
  "success": true,
  "sessionId": "uuid",
  "fileName": "Schedule.xlsx",
  "records": [],
  "conflicts": [],
  "summary": {},
  "metadata": {
    "worksheetName": "Assignments",
    "headerRowIndex": 3,
    "detectedHeaders": ["subj", "course_number"]
  }
}
```

### `GET /api/conflicts`

```bash
curl http://localhost:4000/api/conflicts \
  -H "x-session-id: <sessionId>"
```

### `POST /api/auto-resolve`

```bash
curl -X POST http://localhost:4000/api/auto-resolve \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<sessionId>",
    "allowTimeShift": true,
    "prioritizeLabs": true
  }'
```

### `GET /api/suggestions/:conflictId`

```bash
curl "http://localhost:4000/api/suggestions/<conflictId>?allowTimeShift=true" \
  -H "x-session-id: <sessionId>"
```

### `POST /api/apply-suggestion/:conflictId`

Pass back one suggestion object returned by the suggestions endpoint:

```bash
curl -X POST http://localhost:4000/api/apply-suggestion/<conflictId> \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<sessionId>",
    "suggestion": {
      "id": "B1|102|MW|540|600",
      "roomKey": "B1|102",
      "newStartMin": 540,
      "newEndMin": 600,
      "newDays": "MW",
      "newDaysList": ["M", "W"],
      "label": "B1 - 102",
      "timeLabel": "09:00 - 10:00",
      "dayLabel": "MW",
      "resolutionNote": "Moved to B1-102 on MW at 09:00"
    }
  }'
```

### `POST /api/export`

```bash
curl -X POST http://localhost:4000/api/export \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sessionId>"}' \
  --output Resolved_Schedule.xlsx
```

## Error handling

Errors return structured JSON:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_WORKBOOK",
    "message": "The uploaded file is not a valid XLSX workbook.",
    "details": {
      "reason": "..."
    }
  }
}
```

Typical status codes:

- `400` validation or workbook-content errors
- `404` missing session or conflict
- `413` file too large
- `415` unsupported file type
- `500` unexpected server errors

## Testing

Run the full suite with coverage:

```bash
npm test
```

Included coverage areas:

- Unit tests for parsing, conflict detection, suggestion generation, and resolution
- Integration tests for upload, suggestions, manual application, auto-resolution, export, malformed uploads, empty workbooks, and size limits

## Notes

- Session state is in-memory right now. For multi-instance deployment, swap `sessionStore.js` to Redis or a database-backed store.
- The backend is written in ESM JavaScript, with `.d.ts` interface definitions for shared typing/documentation.
- The existing React frontend can be migrated incrementally to call these API endpoints instead of running the business logic in `src/App.tsx`.
