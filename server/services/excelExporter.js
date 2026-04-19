import ExcelJS from 'exceljs';

import { normalizeHeaderName } from './scheduleUtils.js';

const EXPORT_COLUMN_HINTS = {
  days: ['days', 'day', 'meeting_days', 'meeting_pattern'],
  start: ['start', 'start_time', 'begin_time', 'meeting_start', 'time_start'],
  end: ['end', 'end_time', 'meeting_end', 'time_end'],
  bldg: ['bldg', 'building', 'assigned_bldg', 'room_building'],
  room: ['room', 'assigned_room', 'room_number'],
};

function resolveColumnIndex(headerRow, hints) {
  let index = 0;

  headerRow.eachCell((cell, columnNumber) => {
    const normalized = normalizeHeaderName(cell.value);
    if (index === 0 && hints.some((hint) => normalized.includes(hint))) {
      index = columnNumber;
    }
  });

  return index;
}

export async function exportWorkbook(sourceBuffer, records, fileName = 'Resolved_Schedule.xlsx', metadata = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBuffer);

  const worksheet = workbook.worksheets[0];
  const configuredHeaderRow = metadata.headerRowIndex || 1;
  const headerRow = worksheet.getRow(configuredHeaderRow);
  const fallbackHeaderRow = worksheet.getRow(1);
  const activeHeaderRow = headerRow.actualCellCount > 0 ? headerRow : fallbackHeaderRow;

  const columnMap = {
    days: resolveColumnIndex(activeHeaderRow, EXPORT_COLUMN_HINTS.days),
    start: resolveColumnIndex(activeHeaderRow, EXPORT_COLUMN_HINTS.start),
    end: resolveColumnIndex(activeHeaderRow, EXPORT_COLUMN_HINTS.end),
    bldg: resolveColumnIndex(activeHeaderRow, EXPORT_COLUMN_HINTS.bldg),
    room: resolveColumnIndex(activeHeaderRow, EXPORT_COLUMN_HINTS.room),
  };

  const resolutionColumnIndex = activeHeaderRow.actualCellCount + 1;
  activeHeaderRow.getCell(resolutionColumnIndex).value = 'Resolution Action';
  activeHeaderRow.getCell(resolutionColumnIndex).font = { bold: true };

  records.forEach((record) => {
    const row = worksheet.getRow(record._excel_row_number);
    if (columnMap.bldg) {
      row.getCell(columnMap.bldg).value = record.assigned_bldg;
    }
    if (columnMap.room) {
      row.getCell(columnMap.room).value = record.assigned_room;
    }
    if (columnMap.days) {
      row.getCell(columnMap.days).value = record.days;
    }
    if (columnMap.start) {
      row.getCell(columnMap.start).value = record.start;
    }
    if (columnMap.end) {
      row.getCell(columnMap.end).value = record.end;
    }

    row.getCell(resolutionColumnIndex).value =
      record.resolution_action || record.conflict_note || 'No conflict detected';
  });

  const outputBuffer = await workbook.xlsx.writeBuffer();

  return {
    fileName: fileName.startsWith('Resolved_') ? fileName : `Resolved_${fileName}`,
    buffer: Buffer.from(outputBuffer),
  };
}
