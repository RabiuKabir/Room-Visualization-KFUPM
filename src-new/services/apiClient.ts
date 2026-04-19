/**
 * API Client Service
 * Centralized HTTP client for all backend API calls
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const HEALTH_URL = API_BASE_URL.endsWith('/api')
  ? `${API_BASE_URL.slice(0, -4)}/health`
  : '/health';

let activeSessionId: string | null = null;
let activeConflicts: Array<any> = [];
const suggestionsByConflictId = new Map<string, Array<any>>();

function setSessionState(payload: { sessionId?: string; conflicts?: Array<any>; summary?: any }) {
  if (payload.sessionId) {
    activeSessionId = payload.sessionId;
  }

  if (Array.isArray(payload.conflicts)) {
    activeConflicts = payload.conflicts;
  }
}

function requireSessionId(): string {
  if (!activeSessionId) {
    throw new Error('Upload a workbook before using this action.');
  }

  return activeSessionId;
}

function getConflictByIndex(conflictIndex: number) {
  const conflict = activeConflicts[conflictIndex];

  if (!conflict?.id) {
    throw new Error('The selected conflict could not be found. Refresh the conflict list and try again.');
  }

  return conflict;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponse {
  data: Array<any>;
  conflicts: Array<any>;
  fileName: string;
  sessionId?: string;
  summary?: any;
}

export interface ConflictResolutionResponse {
  data: Array<any>;
  conflicts: Array<any>;
  summary?: any;
}

export interface ExportRequest {
  data: Array<any>;
  fileName: string;
}

/**
 * Upload Excel file and get processed data
 */
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json();
  setSessionState(result);
  suggestionsByConflictId.clear();

  return {
    data: result.records || [],
    conflicts: result.conflicts || [],
    fileName: result.fileName,
    sessionId: result.sessionId,
    summary: result.summary,
  };
}

/**
 * Get current conflicts
 */
export async function getConflicts(data: Array<any>): Promise<Array<any>> {
  void data;
  const response = await fetch(`${API_BASE_URL}/conflicts`, {
    method: 'GET',
    headers: {
      'x-session-id': requireSessionId(),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json();
  setSessionState(result);
  return result.conflicts || [];
}

/**
 * Run auto-resolution on conflicted data
 */
export async function runAutoResolve(
  data: Array<any>,
  options: {
    prioritizeLabs?: boolean;
    allowTimeShift?: boolean;
  } = {}
): Promise<ConflictResolutionResponse> {
  void data;
  const response = await fetch(`${API_BASE_URL}/auto-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: requireSessionId(),
      allowTimeShift: options.allowTimeShift ?? false,
      prioritizeLabs: options.prioritizeLabs ?? true,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json();
  setSessionState(result);
  suggestionsByConflictId.clear();

  return {
    data: result.records || [],
    conflicts: result.conflicts || [],
    summary: result.summary,
  };
}

/**
 * Get suggestions for a specific conflict
 */
export async function getSuggestions(
  data: Array<any>,
  conflictIndex: number,
  options: {
    allowTimeShift?: boolean;
  } = {}
): Promise<Array<any>> {
  void data;
  const sessionId = requireSessionId();
  const conflict = getConflictByIndex(conflictIndex);
  const url = new URL(`${API_BASE_URL}/suggestions/${encodeURIComponent(conflict.id)}`, window.location.origin);

  if (options.allowTimeShift) {
    url.searchParams.set('allowTimeShift', 'true');
  }

  const response = await fetch(url.pathname + url.search, {
    method: 'GET',
    headers: {
      'x-session-id': sessionId,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json();
  const suggestions = result.suggestions || [];
  suggestionsByConflictId.set(conflict.id, suggestions);
  return suggestions;
}

/**
 * Apply a suggestion to resolve a conflict
 */
export async function applySuggestion(
  data: Array<any>,
  conflictIndex: number,
  suggestionIndex: number
): Promise<ConflictResolutionResponse> {
  void data;
  const sessionId = requireSessionId();
  const conflict = getConflictByIndex(conflictIndex);
  const suggestions = suggestionsByConflictId.get(conflict.id);
  const suggestion = suggestions?.[suggestionIndex];

  if (!suggestion) {
    throw new Error('The selected suggestion is no longer available. Refresh suggestions and try again.');
  }

  const response = await fetch(`${API_BASE_URL}/apply-suggestion/${encodeURIComponent(conflict.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      suggestion,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json();
  setSessionState(result);
  suggestionsByConflictId.delete(conflict.id);

  return {
    data: result.records || [],
    conflicts: result.conflicts || [],
    summary: result.summary,
  };
}

/**
 * Export data as Excel file
 */
export async function exportData(
  data: Array<any>,
  fileName: string
): Promise<Blob> {
  void data;
  const response = await fetch(`${API_BASE_URL}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: requireSessionId(),
      fileName,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return await response.blob();
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(data: Array<any>): Promise<any> {
  void data;
  const response = await fetch(`${API_BASE_URL}/dashboard-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: requireSessionId() }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return await response.json();
}

/**
 * Health check endpoint
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
