import ExcelJS from 'exceljs';

import { ApiError } from '../middleware/errorHandler.js';
import { detectConflicts } from './conflictDetector.js';
import { normalizeHeaderName, parseDays, parseTime } from './scheduleUtils.js';

const COLUMN_ALIASES = {
  subject: ['subject', 'subj', 'course_subject'],
  number: ['number', 'num', 'course_number', 'catalog_number', 'catalog_num'],
  title: ['title', 'course_title', 'class_title'],
  section: ['section', 'sec', 'course_section'],
  section_act: ['section_act', 'act', 'activity', 'type', 'component'],
  days: ['days', 'day', 'meeting_days', 'meeting_pattern'],
  start: ['start', 'start_time', 'begin_time', 'meeting_start', 'time_start'],
  end: ['end', 'end_time', 'meeting_end', 'time_end'],
  bldg: ['bldg', 'building', 'assigned_bldg', 'room_building'],
  room: ['room', 'assigned_room', 'room_number'],
};

const EXPECTED_HINTS = ['subject', 'number', 'title', 'days', 'start', 'end', 'room', 'bldg'];

function cellValueToPrimitive(cellValue) {
  if (cellValue === undefined || cellValue === null) {
    return '';
  }

  if (cellValue instanceof Date) {
    return cellValue;
  }

  if (typeof cellValue === 'object') {
    if ('result' in cellValue && cellValue.result !== undefined && cellValue.result !== null) {
      return cellValueToPrimitive(cellValue.result);
    }

    if ('text' in cellValue && typeof cellValue.text === 'string') {
      return cellValue.text;
    }

    if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((entry) => entry.text || '').join('');
    }
  }

  return cellValue;
}

function findHeaderRow(worksheet) {
  let bestRowIndex = 0;
  let bestMatchCount = 0;
  let detectedHeaders = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 20) {
      return;
    }

    const normalizedHeaders = [];
    let matches = 0;

    row.eachCell((cell) => {
      const normalized = normalizeHeaderName(cellValueToPrimitive(cell.value));
      normalizedHeaders.push(normalized);
      if (EXPECTED_HINTS.some((hint) => normalized.includes(hint))) {
        matches += 1;
      }
    });

    if (matches > bestMatchCount) {
      // We score the first 20 rows and keep the row that best matches the expected schedule vocabulary.
      bestRowIndex = rowNumber;
      bestMatchCount = matches;
      detectedHeaders = normalizedHeaders;
    }
  });

  if (bestRowIndex === 0 || bestMatchCount < 3) {
    throw new ApiError(
      400,
      'Unable to detect a valid header row in the uploaded workbook.',
      { expectedColumns: EXPECTED_HINTS },
      'HEADER_ROW_NOT_FOUND',
    );
  }

  return { headerRowIndex: bestRowIndex, detectedHeaders };
}

function buildHeaders(headerRow) {
  const headers = [];
  headerRow.eachCell((cell, columnNumber) => {
    headers[columnNumber] = String(cellValueToPrimitive(cell.value) || '').trim();
  });
  return headers;
}

function resolveField(rowData, aliases, keyMap) {
  const entries = Object.entries(rowData);
  const found = entries.find(([header]) => aliases.includes(normalizeHeaderName(header)));

  if (!found) {
    return '';
  }

  keyMap[aliases[0]] = found[0];
  return found[1];
}

function isMeaningfulRow(record) {
  return Boolean(
    record.subject ||
      record.number ||
      record.title ||
      record.days ||
      record.assigned_bldg ||
      record.assigned_room,
  );
}

export async function parseWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new ApiError(
      400,
      'The uploaded file is not a valid XLSX workbook.',
      { reason: error.message },
      'INVALID_WORKBOOK',
    );
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new ApiError(400, 'The workbook does not contain any worksheets.', undefined, 'WORKSHEET_NOT_FOUND');
  }

  const { headerRowIndex, detectedHeaders } = findHeaderRow(worksheet);
  const headerRow = worksheet.getRow(headerRowIndex);
  const headers = buildHeaders(headerRow);
  const records = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowIndex) {
      return;
    }

    const rowData = {};
    row.eachCell((cell, columnNumber) => {
      const header = headers[columnNumber];
      if (header) {
        rowData[header] = cellValueToPrimitive(cell.value);
      }
    });

    if (Object.keys(rowData).length === 0) {
      return;
    }

    const keysMap = {};
    const subject = String(resolveField(rowData, COLUMN_ALIASES.subject, keysMap) || '').trim();
    const number = String(resolveField(rowData, COLUMN_ALIASES.number, keysMap) || '').trim();
    const title = String(resolveField(rowData, COLUMN_ALIASES.title, keysMap) || '').trim();
    const section = String(resolveField(rowData, COLUMN_ALIASES.section, keysMap) || '').trim();
    const sectionAct = String(resolveField(rowData, COLUMN_ALIASES.section_act, keysMap) || '').trim();
    const days = String(resolveField(rowData, COLUMN_ALIASES.days, keysMap) || '').trim().toUpperCase();
    const start = resolveField(rowData, COLUMN_ALIASES.start, keysMap) || '';
    const end = resolveField(rowData, COLUMN_ALIASES.end, keysMap) || '';
    const bldg = String(resolveField(rowData, COLUMN_ALIASES.bldg, keysMap) || '').trim();
    const room = String(resolveField(rowData, COLUMN_ALIASES.room, keysMap) || '').trim();
    const daysList = parseDays(days);
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);

    const record = {
      id: records.length,
      subject,
      number,
      title,
      section,
      section_act: sectionAct,
      days,
      start,
      end,
      bldg,
      room,
      assigned_bldg: bldg,
      assigned_room: room,
      course_id: [subject, number, section].filter(Boolean).join('-') || `ROW-${rowNumber}`,
      days_list: daysList,
      start_min: startMinutes,
      end_min: endMinutes,
      is_lab: sectionAct.toUpperCase() === 'LAB' || title.toLowerCase().includes('lab'),
      conflict_flag: false,
      conflict_note: '',
      resolution_action: '',
      _original_row: rowData,
      _keys: keysMap,
      _excel_row_number: rowNumber,
    };

    if (isMeaningfulRow(record)) {
      records.push(record);
    }
  });

  if (records.length === 0) {
    throw new ApiError(400, 'No schedule rows were detected in the workbook.', undefined, 'NO_DATA_ROWS');
  }

  const conflictState = detectConflicts(records);

  return {
    records: conflictState.records,
    conflicts: conflictState.conflicts,
    summary: conflictState.summary,
    metadata: {
      worksheetName: worksheet.name,
      headerRowIndex,
      detectedHeaders,
    },
  };
}
