# Running Both App Versions - Setup Guide

## Project Structure

```
room-assignment-conflict-resolver/
├── src/                          # Old Frontend (Client-side only)
│   ├── App.tsx                   # Original app with all logic
│   ├── index.css
│   ├── main.tsx
│   └── ...
│
├── src-new/                      # New Frontend (API-based)
│   ├── App.tsx                   # Refactored to use APIs
│   ├── services/
│   │   └── apiClient.ts          # HTTP client for backend
│   ├── index.css
│   ├── main.tsx
│   └── ...
│
├── server/                       # Express Backend
│   ├── app.js                    # Main Express app
│   ├── server.js                 # Server entry point
│   ├── routes/                   # API endpoints
│   ├── services/                 # Business logic
│   ├── tests/                    # Test files
│   └── ...
│
├── index.html                    # Old frontend entry
├── index-new.html                # New frontend entry
├── vite.config.ts                # Old Vite config
├── vite-new.config.ts            # New Vite config
├── package.json                  # NPM scripts updated
├── .env.local                    # API endpoint config
└── ...
```

## Quick Start Commands

### 1. Install Dependencies First

```bash
npm install
```

### 2. Run the Backend Server (Required for new frontend)

```bash
npm run server:dev
```

Backend will run on **http://localhost:3000**

### 3. Run the Old Frontend (Client-side only)

```bash
npm run dev:old
```

Old frontend runs on **http://localhost:3000** (port conflict - run only if server is not running)

### 4. Run the New Frontend (API-based)

```bash
npm run dev:new
```

New frontend runs on **http://localhost:3001** and calls backend APIs

### 5. Run Everything Together (Recommended)

```bash
npm run dev:all
```

This starts:

- Backend Server on port 3000
- New Frontend on port 3001

Uses `concurrently` to run both in parallel.

---

## Detailed Workflow

### For Development (Testing New API-Based Version)

**Terminal 1: Start Backend**

```bash
npm run server:dev
```

Watch mode - auto-reloads on changes. Runs on port 3000.

**Terminal 2: Start New Frontend**

```bash
npm run dev:new
```

Vite dev server with HMR. Runs on port 3001.
Opens http://localhost:3001 automatically.

**Access the app:**

- New API-based frontend: http://localhost:3001
- Backend API: http://localhost:3000/api

### For Production (Build)

**Build new frontend:**

```bash
npm run build:new
```

Outputs to `dist/`

**Build and start server:**

```bash
npm run server:start
```

---

## Key Differences Between Versions

### Old Frontend (`src/App.tsx`)

- ✅ All logic runs client-side
- ✅ Standalone (no server needed)
- ✅ Good for testing/understanding
- ❌ Slower for large files
- ❌ No persistent data
- ❌ Uses browser memory

### New Frontend (`src-new/App.tsx`)

- ✅ Cleaner, simpler component
- ✅ All heavy logic server-side
- ✅ Faster responses
- ✅ Better for production
- ✅ Persistent backend
- ✅ Scalable
- ❌ Requires backend server running

---

## API Endpoints

The new frontend calls these backend APIs:

```
POST   /api/upload              # Upload Excel file
POST   /api/conflicts           # Get conflicts for data
POST   /api/auto-resolve        # Run auto-resolution
POST   /api/suggestions         # Get suggestions for conflict
POST   /api/apply-suggestion    # Apply a suggestion
POST   /api/export              # Export to Excel
POST   /api/dashboard-stats     # Get dashboard statistics
GET    /api/health              # Health check
```

See `src-new/services/apiClient.ts` for all API calls.

---

## Testing

### Run Backend Tests

```bash
npm test
```

### Watch Mode (auto-rerun on changes)

```bash
npm run test:watch
```

### With Coverage Report

```bash
npm run test:coverage
```

---

## Troubleshooting

### Port Already in Use

If port 3000 or 3001 is already in use:

- Kill the process using the port
- Or modify the port in package.json scripts

### API Connection Error

Make sure:

1. Backend server is running (`npm run server:dev`)
2. `.env.local` has correct `VITE_API_URL=http://localhost:3000/api`
3. Both running on correct ports

### Build Issues

```bash
npm run clean
npm install
npm run dev:all
```

---

## Next Steps

1. **Test both frontends** - Upload same Excel file to both
2. **Compare results** - Old should show same data as new
3. **Performance test** - New should be faster for large files
4. **Deploy** - When satisfied, deploy backend and run `npm run build:new`

---

## Environment Variables

Create `.env.local`:

```
VITE_API_URL=http://localhost:3000/api
```

For production, update to your server URL:

```
VITE_API_URL=https://your-api.com/api
```

---

## Summary of Scripts

| Script                 | Purpose                           | Port      |
| ---------------------- | --------------------------------- | --------- |
| `npm run dev:old`      | Old frontend (client-only)        | 3000      |
| `npm run dev:new`      | New frontend (API-based)          | 3001      |
| `npm run server:dev`   | Backend development with watch    | 3000      |
| `npm run server:start` | Backend production                | 3000      |
| `npm run dev:all`      | Run backend + new frontend        | 3000-3001 |
| `npm run build:new`    | Build new frontend for production | -         |
| `npm run test`         | Run all tests                     | -         |

---

**Good luck! Let me know if you run into any issues!** 🚀
