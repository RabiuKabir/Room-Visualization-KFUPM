import { DAY_ORDER } from '../models/types.js';

export const DAY_LABELS = {
  U: 'Sun',
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  R: 'Thu',
  F: 'Fri',
  S: 'Sat',
};

const DAY_NAME_REPLACEMENTS = [
  [/SUNDAY/gi, 'U'],
  [/SUN/gi, 'U'],
  [/MONDAY/gi, 'M'],
  [/MON/gi, 'M'],
  [/TUESDAY/gi, 'T'],
  [/TUES/gi, 'T'],
  [/TUE/gi, 'T'],
  [/WEDNESDAY/gi, 'W'],
  [/WED/gi, 'W'],
  [/THURSDAY/gi, 'R'],
  [/THURSDAYS/gi, 'R'],
  [/THURS/gi, 'R'],
  [/THUR/gi, 'R'],
  [/THU/gi, 'R'],
  [/FRIDAY/gi, 'F'],
  [/FRI/gi, 'F'],
  [/SATURDAY/gi, 'S'],
  [/SAT/gi, 'S'],
];

function isValidTimeParts(hours, minutes) {
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

export function normalizeHeaderName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseDays(value) {
  if (value === undefined || value === null) {
    return [];
  }

  let normalized = String(value).toUpperCase().trim();

  DAY_NAME_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  normalized = normalized.replace(/[^UMTWRFS]/g, '');

  return normalized
    .split('')
    .filter((day, index, source) => DAY_ORDER.includes(day) && source.indexOf(day) === index);
}

export function parseTime(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.getHours() * 60 + value.getMinutes();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) {
      return null;
    }

    const excelFraction = value % 1;
    if (value < 1 || (value > 2359 && excelFraction > 0)) {
      return Math.round(excelFraction * 24 * 60) || Math.round(value * 24 * 60);
    }

    const digits = Math.round(value).toString().padStart(4, '0');
    const hours = Number.parseInt(digits.slice(0, 2), 10);
    const minutes = Number.parseInt(digits.slice(2, 4), 10);
    return isValidTimeParts(hours, minutes) ? hours * 60 + minutes : null;
  }

  const raw = String(value).trim().toUpperCase();
  if (!raw) {
    return null;
  }

  const amPmMatch = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/);
  if (amPmMatch) {
    let hours = Number.parseInt(amPmMatch[1], 10);
    const minutes = Number.parseInt(amPmMatch[2] || '0', 10);

    if (amPmMatch[3] === 'PM' && hours !== 12) {
      hours += 12;
    }

    if (amPmMatch[3] === 'AM' && hours === 12) {
      hours = 0;
    }

    return isValidTimeParts(hours, minutes) ? hours * 60 + minutes : null;
  }

  if (raw.includes(':')) {
    const [hourPart, minutePart] = raw.split(':');
    const hours = Number.parseInt(hourPart, 10);
    const minutes = Number.parseInt((minutePart || '0').replace(/[^0-9].*$/, ''), 10);
    return isValidTimeParts(hours, minutes) ? hours * 60 + minutes : null;
  }

  if (/^\d{3,4}$/.test(raw)) {
    const digits = raw.padStart(4, '0');
    const hours = Number.parseInt(digits.slice(0, 2), 10);
    const minutes = Number.parseInt(digits.slice(2, 4), 10);
    return isValidTimeParts(hours, minutes) ? hours * 60 + minutes : null;
  }

  const dateCandidate = new Date(raw);
  if (!Number.isNaN(dateCandidate.valueOf())) {
    return dateCandidate.getHours() * 60 + dateCandidate.getMinutes();
  }

  return null;
}

export function formatTime(minutes) {
  if (minutes === null || minutes === undefined) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function cloneRecords(records) {
  return records.map((record) => ({
    ...record,
    days_list: [...record.days_list],
    _original_row: { ...record._original_row },
    _keys: { ...record._keys },
  }));
}

export function getTimeOffsets(allowTimeShift, mode = 'suggestions') {
  if (mode === 'auto-resolve') {
    return allowTimeShift ? [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180, -180] : [0];
  }

  return allowTimeShift ? [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180, -180] : [0, 30, -30, 60, -60];
}
