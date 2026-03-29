/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Download, 
  Search, 
  ChevronRight, 
  ChevronDown,
  Info,
  Layers,
  FlaskConical,
  BookOpen,
  RefreshCw,
  LayoutGrid,
  GanttChartSquare,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import ExcelJS from 'exceljs';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY_ORDER = ["U", "M", "T", "W", "R", "F", "S"] as const;
type DayChar = typeof DAY_ORDER[number];

const DAY_LABELS: Record<DayChar, string> = {
  U: "Sun",
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat"
};

interface CourseRecord {
  id: number;
  subject: string;
  number: string;
  title: string;
  section: string;
  section_act: string;
  days: string;
  start: string | number;
  end: string | number;
  bldg: string;
  room: string;
  assigned_bldg: string;
  assigned_room: string;
  // Computed
  course_id: string;
  days_list: DayChar[];
  start_min: number | null;
  end_min: number | null;
  is_lab: boolean;
  conflict_flag: boolean;
  conflict_note: string;
  _original_row: any;
  _keys: Record<string, string>;
}

interface Suggestion {
  roomKey: string;
  newStartMin: number;
  newEndMin: number;
  newDays: string;
  newDaysList: DayChar[];
  label: string;
  timeLabel: string;
  dayLabel: string;
}

interface Conflict {
  row_index: number;
  course_id: string;
  day: DayChar;
  time: string;
  assigned_bldg: string;
  assigned_room: string;
  type: 'hard' | 'auto-resolved' | 'needs-manual';
  reason: string;
  other_course: string;
  suggestions: string;
}

function parseDays(d: string): DayChar[] {
  const normalized = d.toUpperCase().replace(/\s/g, "");
  return normalized.split("").filter(ch => DAY_ORDER.includes(ch as DayChar)) as DayChar[];
}

function parseTime(t: string | number | undefined): number | null {
  if (t === undefined || t === null || t === "") return null;
  
  if (typeof t === 'number') {
    // Excel time or numeric format like 1400
    if (t < 1) { // Excel fractional day
      return Math.round(t * 24 * 60);
    }
    const s = t.toString().padStart(4, '0');
    const hh = parseInt(s.substring(0, 2));
    const mm = parseInt(s.substring(2));
    return hh * 60 + mm;
  }

  const s = t.trim();
  if (s.includes(":")) {
    const [hh, mm] = s.split(":").map(x => parseInt(x));
    return hh * 60 + mm;
  }
  
  const num = parseInt(s);
  if (!isNaN(num)) {
    const padded = num.toString().padStart(4, '0');
    const hh = parseInt(padded.substring(0, 2));
    const mm = parseInt(padded.substring(2));
    return hh * 60 + mm;
  }

  return null;
}

function formatTime(minutes: number | null): string {
  if (minutes === null) return "";
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function overlaps(a_start: number, a_end: number, b_start: number, b_end: number): boolean {
  return (a_start < b_end) && (b_start < a_end);
}

// --- Main App ---
export default function App() {
  const [data, setData] = useState<CourseRecord[]>([]);
  const [originalData, setOriginalData] = useState<CourseRecord[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [originalFileBuffer, setOriginalFileBuffer] = useState<ArrayBuffer | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'preview' | 'conflicts' | 'planner' | 'timeline'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>("(All rooms)");
  const [prioritizeLabs, setPrioritizeLabs] = useState(true);
  const [allowTimeShift, setAllowTimeShift] = useState(false);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [selectedConflictIdx, setSelectedConflictIdx] = useState<number>(0);

  const suggestedRooms = useMemo(() => {
    if (conflicts.length === 0 || selectedConflictIdx >= conflicts.length) return [];
    const conflict = conflicts[selectedConflictIdx];
    const course = data[conflict.row_index];
    if (!course) return [];

    const allRooms: string[] = Array.from(new Set(data.map(r => `${r.assigned_bldg}|${r.assigned_room}`).filter(r => r !== "|")));
    const duration = (course.end_min || 0) - (course.start_min || 0);

    // Normalize days
    const cleanDays = course.days.trim().toUpperCase();

    // Potential day variations
    const dayVariations: { days: string; daysList: DayChar[] }[] = [
      { days: cleanDays, daysList: course.days_list }
    ];

    // Add common academic day swaps
    if (cleanDays === 'M') {
      dayVariations.push({ days: 'W', daysList: ['W'] });
    } else if (cleanDays === 'W') {
      dayVariations.push({ days: 'M', daysList: ['M'] });
    } else if (cleanDays === 'T') {
      dayVariations.push({ days: 'R', daysList: ['R'] });
    } else if (cleanDays === 'R') {
      dayVariations.push({ days: 'T', daysList: ['T'] });
    } else if (cleanDays === 'MW') {
      dayVariations.push({ days: 'TR', daysList: ['T', 'R'] });
    } else if (cleanDays === 'TR') {
      dayVariations.push({ days: 'MW', daysList: ['M', 'W'] });
    }

    const allPossible: Suggestion[] = [];
    // Always allow a small shift in suggestions to be helpful
    const timeOffsets = allowTimeShift ? [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180, -180] : [0, 30, -30, 60, -60];

    for (const dayVar of dayVariations) {
      for (const offset of timeOffsets) {
        const newStart = (course.start_min || 0) + offset;
        const newEnd = newStart + duration;

        if (newStart < 8 * 60 || newEnd > 20 * 60) continue;

        for (const roomKey of allRooms) {
          const [bldg, room] = roomKey.split('|');
          
          const isFree = dayVar.daysList.every(day => {
            return !data.some((other, idx) => {
              if (idx === conflict.row_index) return false;
              if (other.assigned_bldg !== bldg || other.assigned_room !== room) return false;
              if (!other.days_list.includes(day)) return false;
              if (other.start_min === null || other.end_min === null) return false;
              return overlaps(newStart, newEnd, other.start_min, other.end_min);
            });
          });

          if (isFree) {
            const isTimeShifted = offset !== 0;
            const isDayShifted = dayVar.days !== cleanDays;
            
            allPossible.push({
              roomKey,
              newStartMin: newStart,
              newEndMin: newEnd,
              newDays: dayVar.days,
              newDaysList: dayVar.daysList,
              label: `${bldg} - ${room}`,
              timeLabel: `${formatTime(newStart)} – ${formatTime(newEnd)}${isTimeShifted ? ' (Shifted)' : ''}`,
              dayLabel: `${dayVar.days}${isDayShifted ? ' (Shifted)' : ''}`
            });
            // Don't break yet, we want to collect more to ensure diversity
            if (allPossible.length > 100) break;
          }
        }
        if (allPossible.length > 100) break;
      }
      if (allPossible.length > 100) break;
    }

    // Pick a diverse set: 
    // - 4 from current day, current time (if available)
    // - 4 from current day, shifted time
    // - 4 from alternate day
    const currentDayTime = allPossible.filter(s => s.newDays === cleanDays && s.newStartMin === course.start_min).slice(0, 4);
    const currentDayShifted = allPossible.filter(s => s.newDays === cleanDays && s.newStartMin !== course.start_min).slice(0, 4);
    const alternateDay = allPossible.filter(s => s.newDays !== cleanDays).slice(0, 4);

    // If we don't have enough from specific categories, fill with whatever we have
    let result = [...currentDayTime, ...currentDayShifted, ...alternateDay];
    if (result.length < 8) {
      const remaining = allPossible.filter(s => !result.includes(s)).slice(0, 8 - result.length);
      result = [...result, ...remaining];
    }

    return result;
  }, [conflicts, selectedConflictIdx, data, allowTimeShift]);

  const applySuggestion = (s: Suggestion) => {
    if (conflicts.length === 0 || selectedConflictIdx >= conflicts.length) return;
    const conflict = conflicts[selectedConflictIdx];
    const [bldg, room] = s.roomKey.split('|');
    
    const newData = [...data];
    newData[conflict.row_index] = {
      ...newData[conflict.row_index],
      assigned_bldg: bldg,
      assigned_room: room,
      start_min: s.newStartMin,
      end_min: s.newEndMin,
      start: formatTime(s.newStartMin),
      end: formatTime(s.newEndMin),
      days: s.newDays,
      days_list: s.newDaysList,
      conflict_note: `Manually resolved: Moved to ${bldg}-${room} on ${s.newDays} at ${formatTime(s.newStartMin)}`
    };
    setData(newData);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatic conflict detection
  useEffect(() => {
    if (data.length === 0) return;
    
    const df = data;
    const rebuildOccupancy = (records: CourseRecord[]) => {
      const occ: Record<string, number[]> = {};
      records.forEach((row, idx) => {
        if (!row.assigned_bldg || !row.assigned_room || row.days_list.length === 0 || row.start_min === null || row.end_min === null) return;
        row.days_list.forEach(d => {
          const key = `${d}|${row.assigned_bldg}|${row.assigned_room}`;
          if (!occ[key]) occ[key] = [];
          occ[key].push(idx);
        });
      });
      return occ;
    };

    const currentOccupancy = rebuildOccupancy(df);
    const conflictRows: Conflict[] = [];

    Object.entries(currentOccupancy).forEach(([key, idxs]) => {
      const [day, bldg, room] = key.split("|");
      const sortedIdxs = idxs.sort((a, b) => (df[a].start_min || 0) - (df[b].start_min || 0));

      for (let i = 0; i < sortedIdxs.length; i++) {
        for (let j = i + 1; j < sortedIdxs.length; j++) {
          const a = sortedIdxs[i];
          const b = sortedIdxs[j];
          if (overlaps(df[a].start_min!, df[a].end_min!, df[b].start_min!, df[b].end_min!)) {
            conflictRows.push({
              row_index: a, day: day as DayChar, assigned_bldg: bldg, assigned_room: room,
              type: 'hard', reason: 'Room Overlap', other_course: df[b].course_id,
              course_id: df[a].course_id, time: `${formatTime(df[a].start_min)}-${formatTime(df[a].end_min)}`, suggestions: ""
            });
          }
        }
      }
    });
    setConflicts(conflictRows);
  }, [data]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);

    try {
      const buffer = await file.arrayBuffer();
      setOriginalFileBuffer(buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];
      
      // Find header row (row with most matches to expected columns)
      const expectedCols = ['subject', 'number', 'title', 'days', 'start', 'end', 'room', 'bldg'];
      let headerRowIdx = 1;
      let maxMatches = 0;
      
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 20) return; // Only check first 20 rows
        let matches = 0;
        row.eachCell((cell) => {
          const val = cell.value?.toString().toLowerCase() || "";
          if (expectedCols.some(col => val.includes(col))) {
            matches++;
          }
        });
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIdx = rowNumber;
        }
      });

      const headerRow = worksheet.getRow(headerRowIdx);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString() || "";
      });

      const processed: CourseRecord[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRowIdx) return;

        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            // Handle different cell value types (ExcelJS can return objects for dates/formulas)
            let val = cell.value;
            if (val && typeof val === 'object' && 'result' in val) val = val.result;
            if (val && typeof val === 'object' && 'text' in val) val = val.text;
            rowData[header] = val;
          }
        });

        // Flexible column mapping
        const keysMap: Record<string, string> = {};
        const getVal = (keys: string[]) => {
          const foundKey = Object.keys(rowData).find(k => keys.includes(k.toLowerCase().trim().replace(/\s/g, '_')));
          if (foundKey) {
            keysMap[keys[0]] = foundKey;
            return rowData[foundKey];
          }
          return "";
        };

        const subject = String(getVal(['subject', 'subj']) || "").trim();
        const number = String(getVal(['number', 'num', 'course_number']) || "").trim();
        const section = String(getVal(['section', 'sec']) || "").trim();
        const title = String(getVal(['title', 'course_title']) || "").trim();
        const section_act = String(getVal(['section_act', 'act', 'type']) || "").trim();
        const days = String(getVal(['days', 'day']) || "").trim();
        const start = getVal(['start', 'start_time', 'begin_time']);
        const end = getVal(['end', 'end_time']);
        const bldg = String(getVal(['bldg', 'building', 'assigned_bldg']) || "").trim();
        const room = String(getVal(['room', 'assigned_room']) || "").trim();

        const start_min = parseTime(start);
        const end_min = parseTime(end);
        const days_list = parseDays(days);
        const is_lab = section_act.toUpperCase() === "LAB" || title.toLowerCase().includes("lab");

        processed.push({
          id: processed.length,
          subject,
          number,
          title,
          section,
          section_act,
          days,
          start,
          end,
          bldg,
          room,
          assigned_bldg: bldg,
          assigned_room: room,
          course_id: `${subject}-${number}-${section}`,
          days_list,
          start_min,
          end_min,
          is_lab,
          conflict_flag: false,
          conflict_note: "",
          _original_row: rowData,
          _keys: keysMap
        });
      });

      // Initial conflict detection for notes
      const occ: Record<string, number[]> = {};
      processed.forEach((row, idx) => {
        if (!row.assigned_bldg || !row.assigned_room || row.days_list.length === 0 || row.start_min === null || row.end_min === null) return;
        row.days_list.forEach(d => {
          const key = `${d}|${row.assigned_bldg}|${row.assigned_room}`;
          if (!occ[key]) occ[key] = [];
          occ[key].push(idx);
        });
      });

      Object.values(occ).forEach(idxs => {
        const sortedIdxs = idxs.sort((a, b) => (processed[a].start_min || 0) - (processed[b].start_min || 0));
        for (let i = 0; i < sortedIdxs.length; i++) {
          for (let j = i + 1; j < sortedIdxs.length; j++) {
            const a = sortedIdxs[i];
            const b = sortedIdxs[j];
            if (overlaps(processed[a].start_min!, processed[a].end_min!, processed[b].start_min!, processed[b].end_min!)) {
              processed[a].conflict_note = `CONFLICT: Overlaps with ${processed[b].course_id}`;
              processed[b].conflict_note = `CONFLICT: Overlaps with ${processed[a].course_id}`;
            }
          }
        }
      });

      setData(processed);
      setOriginalData(JSON.parse(JSON.stringify(processed)));
    } catch (err) {
      console.error("Error parsing file:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const runAutoResolve = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      const df = JSON.parse(JSON.stringify(data)) as CourseRecord[];
      const rooms = Array.from(new Set(df.map(r => `${r.assigned_bldg}|${r.assigned_room}`)))
        .filter(r => r !== "|" && r !== "")
        .map(r => r.split("|"));

      const rebuildOccupancy = (records: CourseRecord[]) => {
        const occ: Record<string, number[]> = {};
        records.forEach((row, idx) => {
          if (!row.assigned_bldg || !row.assigned_room || row.days_list.length === 0 || row.start_min === null || row.end_min === null) return;
          row.days_list.forEach(d => {
            const key = `${d}|${row.assigned_bldg}|${row.assigned_room}`;
            if (!occ[key]) occ[key] = [];
            occ[key].push(idx);
          });
        });
        return occ;
      };

      let currentOccupancy = rebuildOccupancy(df);
      const conflictRows: Conflict[] = [];

      // Detect ALL conflicts first
      Object.entries(currentOccupancy).forEach(([key, idxs]) => {
        const [day, bldg, room] = key.split("|");
        const sortedIdxs = idxs.sort((a, b) => (df[a].start_min || 0) - (df[b].start_min || 0));

        for (let i = 0; i < sortedIdxs.length; i++) {
          for (let j = i + 1; j < sortedIdxs.length; j++) {
            const a = sortedIdxs[i];
            const b = sortedIdxs[j];
            if (overlaps(df[a].start_min!, df[a].end_min!, df[b].start_min!, df[b].end_min!)) {
              conflictRows.push({
                row_index: a, day: day as DayChar, assigned_bldg: bldg, assigned_room: room,
                type: 'hard', reason: 'Room Overlap', other_course: df[b].course_id,
                course_id: df[a].course_id, time: `${formatTime(df[a].start_min)}-${formatTime(df[a].end_min)}`, suggestions: ""
              });
            }
          }
        }
      });

      // Attempt Auto-Resolution for conflicts
      const resolvedIndices = new Set<number>();
      const finalConflicts: Conflict[] = [];

      // Clear previous notes
      df.forEach(r => r.conflict_note = "");

      conflictRows.forEach(conflict => {
        if (resolvedIndices.has(conflict.row_index)) return;

        const move_idx = conflict.row_index;
        const ra = df[move_idx];
        const duration = (ra.end_min || 0) - (ra.start_min || 0);
        
        // Try to find a free room
        let foundSlot = false;
        
        // Potential start times to try
        const timeOffsets = allowTimeShift ? [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180, -180] : [0];
        
        for (const offset of timeOffsets) {
          const newStart = (ra.start_min || 0) + offset;
          const newEnd = newStart + duration;
          
          // Keep within reasonable bounds (8 AM - 8 PM)
          if (newStart < 8 * 60 || newEnd > 20 * 60) continue;

          for (const [nb, nr] of rooms) {
            const isFree = ra.days_list.every(d => {
              const key = `${d}|${nb}|${nr}`;
              return !(currentOccupancy[key] || []).some(idx2 => {
                if (idx2 === move_idx) return false;
                return overlaps(newStart, newEnd, df[idx2].start_min!, df[idx2].end_min!);
              });
            });

            if (isFree) {
              df[move_idx].assigned_bldg = nb;
              df[move_idx].assigned_room = nr;
              df[move_idx].start_min = newStart;
              df[move_idx].end_min = newEnd;
              df[move_idx].start = formatTime(newStart);
              df[move_idx].end = formatTime(newEnd);
              df[move_idx].conflict_note = `Auto-resolved: Moved to ${nb}-${nr}${offset !== 0 ? ` and shifted by ${offset} min` : ""}`;
              
              currentOccupancy = rebuildOccupancy(df);
              resolvedIndices.add(move_idx);
              foundSlot = true;
              break;
            }
          }
          if (foundSlot) break;
        }

        if (!foundSlot) {
          finalConflicts.push(conflict);
          df[conflict.row_index].conflict_note = `CONFLICT: Overlaps with ${conflict.other_course} in ${conflict.assigned_bldg}-${conflict.assigned_room}`;
        }
      });

      setData(df);
      setConflicts(finalConflicts);
      setIsProcessing(false);
    }, 100);
  }, [data, prioritizeLabs, allowTimeShift]);

  const exportExcel = async () => {
    if (!originalFileBuffer) {
      console.error("Original file buffer not found");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(originalFileBuffer);
    const worksheet = workbook.worksheets[0];

    // Find header row again to map columns in ExcelJS
    let headerRowIdx = 1;
    const expectedCols = ['subject', 'number', 'title', 'days', 'start', 'end', 'room', 'bldg'];
    
    for (let i = 1; i <= Math.min(worksheet.rowCount, 20); i++) {
      const row = worksheet.getRow(i);
      let matches = 0;
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && expectedCols.some(col => cell.value.toString().toLowerCase().includes(col))) {
          matches++;
        }
      });
      if (matches >= 3) {
        headerRowIdx = i;
        break;
      }
    }

    const headerRow = worksheet.getRow(headerRowIdx);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const val = cell.value?.toString().toLowerCase().trim().replace(/\s/g, '_') || '';
      if (val.includes('subject')) colMap.subject = colNumber;
      if (val.includes('number')) colMap.number = colNumber;
      if (val.includes('title')) colMap.title = colNumber;
      if (val.includes('days')) colMap.days = colNumber;
      if (val.includes('start')) colMap.start = colNumber;
      if (val.includes('end')) colMap.end = colNumber;
      if (val.includes('room')) colMap.room = colNumber;
      if (val.includes('bldg')) colMap.bldg = colNumber;
    });

    // Add Resolution Action header
    const lastCol = headerRow.actualCellCount;
    const resColIdx = lastCol + 1;
    headerRow.getCell(resColIdx).value = "Resolution Action";
    headerRow.getCell(resColIdx).font = { bold: true };

    // Update data rows
    data.forEach((item) => {
      // item.id is the original index in the rawData array (after header)
      const excelRowIdx = headerRowIdx + 1 + item.id;
      const row = worksheet.getRow(excelRowIdx);
      
      if (colMap.bldg) row.getCell(colMap.bldg).value = item.assigned_bldg;
      if (colMap.room) row.getCell(colMap.room).value = item.assigned_room;
      if (colMap.start) row.getCell(colMap.start).value = item.start;
      if (colMap.end) row.getCell(colMap.end).value = item.end;
      if (colMap.days) row.getCell(colMap.days).value = item.days;
      
      row.getCell(resColIdx).value = item.conflict_note || "No conflict detected";
    });

    // Write to buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resolved_${fileName || 'Schedule.xlsx'}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // --- Visualizations Data ---
  const dashboardData = useMemo(() => {
    if (data.length === 0) return null;

    // Conflicts by day
    const dayConflicts = DAY_ORDER.map(day => ({
      name: DAY_LABELS[day],
      count: conflicts.filter(c => c.day === day).length
    }));

    // Course types
    const typeData = [
      { name: 'Lecture', value: data.filter(d => !d.is_lab).length, color: '#3b82f6' },
      { name: 'Lab', value: data.filter(d => d.is_lab).length, color: '#f59e0b' }
    ];

    // Room utilization (top 5)
    const roomCounts: Record<string, number> = {};
    data.forEach(d => {
      const key = `${d.assigned_bldg}-${d.assigned_room}`;
      if (key !== "-") roomCounts[key] = (roomCounts[key] || 0) + 1;
    });
    const topRooms = Object.entries(roomCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Conflicts by room
    const roomConflicts: Record<string, number> = {};
    conflicts.forEach(c => {
      const key = `${c.assigned_bldg}-${c.assigned_room}`;
      roomConflicts[key] = (roomConflicts[key] || 0) + 1;
    });
    const topConflictRooms = Object.entries(roomConflicts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Time distribution (by hour)
    const timeDist: Record<number, number> = {};
    data.forEach(d => {
      if (d.start_min !== null) {
        const hour = Math.floor(d.start_min / 60);
        timeDist[hour] = (timeDist[hour] || 0) + 1;
      }
    });
    const timeData = Array.from({ length: 13 }, (_, i) => {
      const hour = i + 8; // 8 AM to 8 PM
      return {
        name: `${hour}:00`,
        count: timeDist[hour] || 0
      };
    });

    return { dayConflicts, typeData, topRooms, topConflictRooms, timeData };
  }, [data, conflicts]);

  const roomsList = useMemo(() => {
    const rooms = Array.from(new Set(data.map(r => `${r.assigned_bldg}|${r.assigned_room}`)))
      .filter(r => r !== "|")
      .sort();
    return ["(All rooms)", ...rooms];
  }, [data]);

  const filteredData = useMemo(() => {
    if (selectedRoom === "(All rooms)") return data;
    const [b, r] = selectedRoom.split("|");
    return data.filter(item => item.assigned_bldg === b && item.assigned_room === r);
  }, [data, selectedRoom]);

  // --- Grid View Logic ---
  const gridData = useMemo(() => {
    const starts = filteredData.map(d => d.start_min).filter(t => t !== null) as number[];
    const ends = filteredData.map(d => d.end_min).filter(t => t !== null) as number[];
    
    if (starts.length === 0) return { timeSlots: [], grid: {} };

    let dayStart = Math.min(...starts, 8 * 60);
    let dayEnd = Math.max(...ends, 18 * 60);
    
    dayStart = Math.floor(dayStart / slotMinutes) * slotMinutes;
    dayEnd = Math.ceil(dayEnd / slotMinutes) * slotMinutes;

    const timeSlots: number[] = [];
    for (let t = dayStart; t < dayEnd; t += slotMinutes) {
      timeSlots.push(t);
    }

    const grid: Record<string, Record<DayChar, CourseRecord[]>> = {};
    timeSlots.forEach(t => {
      const timeStr = formatTime(t);
      grid[timeStr] = { U: [], M: [], T: [], W: [], R: [], F: [], S: [] };
      
      filteredData.forEach(row => {
        if (row.start_min === null || row.end_min === null) return;
        const s = Math.floor(row.start_min / slotMinutes) * slotMinutes;
        const e = Math.ceil(row.end_min / slotMinutes) * slotMinutes;
        
        if (t >= s && t < e) {
          row.days_list.forEach(d => {
            grid[timeStr][d].push(row);
          });
        }
      });
    });

    return { timeSlots, grid };
  }, [filteredData, slotMinutes]);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink font-sans selection:bg-brand-ink selection:text-brand-bg">
      {/* Header */}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <motion.div 
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            className="w-10 h-10 bg-brand-ink rounded-xl flex items-center justify-center text-brand-bg shadow-lg shadow-brand-ink/20"
          >
            <Layers size={22} />
          </motion.div>
          <div>
            <h1 className="font-serif italic text-xl leading-tight tracking-tight">Room Assignment</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-muted font-mono font-bold">Conflict Resolver v1.0</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!data.length ? (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
            >
              <Upload size={18} />
              <span>Upload Schedule</span>
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group bg-white border border-brand-border px-4 py-2 rounded-xl hover:bg-brand-bg transition-colors">
                <input 
                  type="checkbox" 
                  checked={allowTimeShift}
                  onChange={(e) => setAllowTimeShift(e.target.checked)}
                  className="w-4 h-4 accent-brand-ink"
                />
                <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-brand-muted group-hover:text-brand-ink transition-colors">Flexible Timing</span>
              </label>
              <div className="flex items-center gap-2">
                <button 
                  onClick={runAutoResolve}
                  disabled={isProcessing}
                  className="btn-secondary"
                >
                  <RefreshCw size={18} className={cn(isProcessing && "animate-spin")} />
                  <span>Auto-Resolve</span>
                </button>
                <button 
                  onClick={exportExcel}
                  className="btn-primary"
                >
                  <Download size={18} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".xlsx, .xls" 
          />
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {!data.length ? (
          <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-[#141414]/20 rounded-xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-md"
            >
              <div className="w-20 h-20 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileSpreadsheet size={40} className="opacity-20" />
              </div>
              <h2 className="text-2xl font-serif italic mb-2">No data loaded</h2>
              <p className="text-sm text-[#141414]/60 mb-8">
                Upload an Excel file containing Subject, Number, Title, Days, Start, End, and Room columns to begin.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#141414] text-[#E4E3E0] px-8 py-3 rounded-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                Choose File
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Total Courses" value={data.length} icon={<BookOpen size={16} />} />
              <StatCard label="Lab Sections" value={data.filter(d => d.is_lab).length} icon={<FlaskConical size={16} />} />
              <StatCard 
                label="Conflicts" 
                value={conflicts.length} 
                icon={<AlertTriangle size={16} />} 
                variant={conflicts.length > 0 ? "danger" : "success"} 
              />
              <StatCard label="Assigned Rooms" value={new Set(data.map(d => `${d.assigned_bldg}-${d.assigned_room}`)).size - 1} icon={<Layers size={16} />} />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-brand-border overflow-x-auto no-scrollbar">
              <TabButton 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')} 
                label="Dashboard" 
                icon={<LayoutGrid size={14} />} 
              />
              <TabButton 
                active={activeTab === 'preview'} 
                onClick={() => setActiveTab('preview')} 
                label="Data Preview" 
                icon={<Search size={14} />} 
              />
              <TabButton 
                active={activeTab === 'conflicts'} 
                onClick={() => setActiveTab('conflicts')} 
                label="Conflicts" 
                icon={<AlertTriangle size={14} />} 
                count={conflicts.length}
              />
              <TabButton 
                active={activeTab === 'planner'} 
                onClick={() => setActiveTab('planner')} 
                label="Weekly Planner" 
                icon={<Calendar size={14} />} 
              />
              <TabButton 
                active={activeTab === 'timeline'} 
                onClick={() => setActiveTab('timeline')} 
                label="Timeline View" 
                icon={<GanttChartSquare size={14} />} 
              />
            </div>

            {/* Content Area */}
            <div className="min-h-[600px]">
              <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && (
                  <motion.div 
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-serif italic text-lg">Conflicts by Day</h3>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Weekly Distribution</span>
                        </div>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dashboardData?.dayConflicts}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{ fill: '#f3f4f6' }}
                              />
                              <Bar dataKey="count" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-serif italic text-lg">Course Distribution</h3>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Lec vs Lab</span>
                        </div>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={dashboardData?.typeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {dashboardData?.typeData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-serif italic text-lg">Top 5 Utilized Rooms</h3>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Section Count</span>
                        </div>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboardData?.topRooms}>
                              <defs>
                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                              />
                              <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-serif italic text-lg">Conflicts by Room</h3>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Top 5 Problematic</span>
                        </div>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dashboardData?.topConflictRooms} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} width={100} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                              />
                              <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    <div className="glass-card p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-serif italic text-lg">Schedule Density</h3>
                        <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Sections by Hour</span>
                      </div>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dashboardData?.timeData}>
                            <defs>
                              <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorTime)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'preview' && (
                  <motion.div 
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card overflow-hidden"
                  >
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest font-mono">
                          <th className="p-3 border-r border-[#E4E3E0]/10">Course ID</th>
                          <th className="p-3 border-r border-[#E4E3E0]/10">Title</th>
                          <th className="p-3 border-r border-[#E4E3E0]/10">Type</th>
                          <th className="p-3 border-r border-[#E4E3E0]/10">Days</th>
                          <th className="p-3 border-r border-[#E4E3E0]/10">Time</th>
                          <th className="p-3">Assigned Room</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slice(0, 50).map((row) => {
                          const hasConflict = conflicts.some(c => c.row_index === row.id);
                          return (
                            <tr key={row.id} className={cn(
                              "border-b border-[#141414]/10 hover:bg-[#141414]/5 transition-colors group",
                              hasConflict && "bg-red-50"
                            )}>
                              <td className="p-3 font-mono text-xs flex items-center gap-2">
                                {hasConflict && <AlertTriangle size={12} className="text-red-500" />}
                                {row.course_id}
                              </td>
                              <td className="p-3 text-sm font-medium">{row.title}</td>
                              <td className="p-3">
                                <span className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                                  row.is_lab ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"
                                )}>
                                  {row.is_lab ? "Lab" : "Lec"}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-xs tracking-widest">{row.days}</td>
                              <td className="p-3 font-mono text-xs">{formatTime(row.start_min)} – {formatTime(row.end_min)}</td>
                              <td className="p-3 font-mono text-xs">{row.assigned_bldg}-{row.assigned_room}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {data.length > 50 && (
                      <div className="p-4 text-center text-[10px] uppercase tracking-widest opacity-50 font-mono">
                        Showing first 50 of {data.length} records
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'conflicts' && (
                  <motion.div 
                    key="conflicts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    {conflicts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 opacity-30">
                        <CheckCircle2 size={48} className="mb-4" />
                        <p className="font-serif italic text-xl">No conflicts detected</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-4">
                          <h2 className="font-serif italic text-xl mb-4">Active Conflicts ({conflicts.length})</h2>
                          {conflicts.map((c, i) => (
                            <div key={i} className="flex items-start gap-4 p-4 border border-[#141414] rounded-sm bg-white hover:shadow-md transition-shadow">
                              <div className="mt-1 text-red-600">
                                <AlertTriangle size={20} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <h3 className="font-bold text-lg">{c.course_id}</h3>
                                  <span className="text-[10px] font-mono uppercase bg-red-50 text-red-800 px-2 py-1 rounded-sm border border-red-200">
                                    {c.type}
                                  </span>
                                </div>
                                <p className="text-sm text-[#141414]/70 mb-3">
                                  <span className="font-bold text-[#141414]">Conflict:</span> {c.reason} with <span className="font-mono bg-[#141414]/5 px-1">{c.other_course}</span>
                                </p>
                                <div className="grid grid-cols-3 gap-4 text-[10px] uppercase tracking-widest font-mono opacity-60">
                                  <div>Day: {DAY_LABELS[c.day]}</div>
                                  <div>Time: {c.time}</div>
                                  <div>Room: {c.assigned_bldg}-{c.assigned_room}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="bg-[#141414]/5 p-6 rounded-sm border border-[#141414]/10 h-fit sticky top-24">
                          <h3 className="font-serif italic text-lg mb-4">Manual Resolution</h3>
                          <p className="text-xs text-[#141414]/60 mb-6">
                            Select a conflict to see alternative rooms or times.
                          </p>
                          
                          <div className="space-y-6">
                            <div className="flex flex-col gap-2">
                              <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Select Conflict</label>
                              <select 
                                value={selectedConflictIdx}
                                onChange={(e) => setSelectedConflictIdx(parseInt(e.target.value))}
                                className="bg-white border border-[#141414] rounded-sm px-3 py-2 text-sm outline-none"
                              >
                                {conflicts.map((c, i) => (
                                  <option key={i} value={i}>{c.course_id} ({DAY_LABELS[c.day]} {c.time})</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="p-4 bg-white border border-[#141414]/10 rounded-sm">
                              <p className="text-[10px] uppercase tracking-widest font-mono opacity-50 mb-2">Suggested Rooms</p>
                              <div className="space-y-2">
                                {suggestedRooms.length > 0 ? (
                                  suggestedRooms.map((s: Suggestion, i) => {
                                    const isShifted = s.timeLabel.includes('(Shifted)') || s.dayLabel.includes('(Shifted)');
                                    return (
                                      <div 
                                        key={i} 
                                        onClick={() => applySuggestion(s)}
                                        className={cn(
                                          "flex flex-col p-3 hover:bg-[#141414]/5 rounded-sm cursor-pointer border transition-all group",
                                          isShifted ? "border-blue-200 bg-blue-50/30" : "border-transparent"
                                        )}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-bold">{s.label}</span>
                                          <span className="text-[8px] uppercase tracking-tighter bg-green-100 text-green-800 px-1 rounded-sm">Free</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          <span className={cn(
                                            "text-[9px] font-mono px-1.5 py-0.5 rounded-sm",
                                            s.dayLabel.includes('(Shifted)') ? "bg-blue-600 text-white" : "bg-[#141414]/10 text-[#141414]"
                                          )}>
                                            {s.dayLabel}
                                          </span>
                                          <span className={cn(
                                            "text-[9px] font-mono px-1.5 py-0.5 rounded-sm",
                                            s.timeLabel.includes('(Shifted)') ? "bg-blue-600 text-white" : "bg-[#141414]/10 text-[#141414]"
                                          )}>
                                            {s.timeLabel}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="text-xs text-center opacity-50 py-4 italic">No free rooms found for this slot.</p>
                                )}
                              </div>
                            </div>

                            <button 
                              onClick={() => {
                                setData(JSON.parse(JSON.stringify(originalData)));
                                setConflicts([]);
                              }}
                              className="w-full flex items-center justify-center gap-2 border border-[#141414] px-4 py-2 rounded-sm text-sm hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                            >
                              <RefreshCw size={14} />
                              <span>Reset to Original</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'planner' && (
                  <motion.div 
                    key="planner"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Filter Room</label>
                          <select 
                            value={selectedRoom}
                            onChange={(e) => setSelectedRoom(e.target.value)}
                            className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                          >
                            {roomsList.map(r => {
                              const label = r === "(All rooms)" ? r : r.replace('|', ' - ');
                              return <option key={r} value={r}>{label}</option>;
                            })}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Slot Size</label>
                          <select 
                            value={slotMinutes}
                            onChange={(e) => setSlotMinutes(parseInt(e.target.value))}
                            className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                          >
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-mono">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></div>
                          <span>Lab</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded-sm"></div>
                          <span>Lecture</span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-[#141414] rounded-sm">
                      <table className="w-full border-collapse table-fixed min-w-[800px]">
                        <thead>
                          <tr className="bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest font-mono">
                            <th className="w-20 p-2 border-r border-[#E4E3E0]/10">Time</th>
                            {DAY_ORDER.map(d => (
                              <th key={d} className="p-2 border-r border-[#E4E3E0]/10 last:border-r-0">{DAY_LABELS[d]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridData.timeSlots.map(t => {
                            const timeStr = formatTime(t);
                            return (
                              <tr key={t} className="border-b border-[#141414]/10 h-12">
                                <td className="p-2 bg-[#141414]/5 text-[10px] font-mono text-center border-r border-[#141414]/10">
                                  {timeStr}
                                </td>
                                {DAY_ORDER.map(d => {
                                  const items = gridData.grid[timeStr]?.[d] || [];
                                  return (
                                    <td key={d} className="p-1 border-r border-[#141414]/10 last:border-r-0 align-top">
                                      {items.map((item, idx) => (
                                        <div 
                                          key={`${item.id}-${idx}`}
                                          className={cn(
                                            "text-[9px] p-1 mb-1 rounded-sm border truncate leading-tight",
                                            item.is_lab 
                                              ? "bg-orange-50 border-orange-200 text-orange-900" 
                                              : "bg-blue-50 border-blue-200 text-blue-900"
                                          )}
                                          title={`${item.course_id}: ${item.title}`}
                                        >
                                          {item.is_lab ? "🧪" : "📘"} {item.course_id}
                                        </div>
                                      ))}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'timeline' && (
                  <motion.div 
                    key="timeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Filter Room</label>
                        <select 
                          value={selectedRoom}
                          onChange={(e) => setSelectedRoom(e.target.value)}
                          className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                        >
                          {roomsList.map(r => {
                            const label = r === "(All rooms)" ? r : r.replace('|', ' - ');
                            return <option key={r} value={r}>{label}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {DAY_ORDER.map(day => {
                        const dayData = filteredData.filter(d => d.days_list.includes(day));
                        if (dayData.length === 0) return null;

                        return (
                          <div key={day} className="space-y-2">
                            <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-bold border-b border-[#141414] pb-1">
                              {DAY_LABELS[day]}
                            </h3>
                            <div className="relative h-24 bg-[#141414]/5 rounded-sm overflow-hidden border border-[#141414]/10">
                              {/* Hour markers */}
                              {Array.from({ length: 13 }).map((_, i) => {
                                const hour = i + 8; // 8 AM to 8 PM
                                const left = ((hour * 60 - 8 * 60) / (12 * 60)) * 100;
                                return (
                                  <div 
                                    key={i} 
                                    className="absolute top-0 bottom-0 border-l border-[#141414]/10" 
                                    style={{ left: `${left}%` }}
                                  >
                                    <span className="absolute top-1 left-1 text-[8px] font-mono opacity-30">{hour}:00</span>
                                  </div>
                                );
                              })}

                              {/* Course blocks */}
                              {dayData.map((course, idx) => {
                                if (course.start_min === null || course.end_min === null) return null;
                                const left = ((course.start_min - 8 * 60) / (12 * 60)) * 100;
                                const width = ((course.end_min - course.start_min) / (12 * 60)) * 100;
                                
                                return (
                                  <motion.div
                                    key={`${course.id}-${idx}`}
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    className={cn(
                                      "absolute top-6 bottom-6 rounded-sm border flex flex-col justify-center px-2 overflow-hidden group cursor-help",
                                      course.is_lab 
                                        ? "bg-orange-100 border-orange-300 text-orange-900" 
                                        : "bg-blue-100 border-blue-300 text-blue-900"
                                    )}
                                    style={{ left: `${left}%`, width: `${width}%`, transformOrigin: 'left' }}
                                    title={`${course.course_id}: ${course.title} (${formatTime(course.start_min)} - ${formatTime(course.end_min)})`}
                                  >
                                    <span className="text-[9px] font-bold truncate">{course.course_id}</span>
                                    <span className="text-[7px] uppercase tracking-tighter truncate opacity-70">{course.assigned_bldg}-{course.assigned_room}</span>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-brand-border p-8 bg-white">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-ink rounded-lg flex items-center justify-center text-brand-bg">
              <Layers size={16} />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-bold text-brand-muted">Academic Resource Management System</span>
          </div>
          <div className="flex gap-8 text-[10px] uppercase tracking-widest font-mono font-bold text-brand-muted">
            <a href="#" className="hover:text-brand-ink transition-colors">Documentation</a>
            <a href="#" className="hover:text-brand-ink transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-brand-ink transition-colors">Support</a>
          </div>
          <div className="text-[10px] font-mono font-bold text-brand-muted">
            © 2026 Room Assignment & Conflict Resolver
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value, icon, variant = "default" }: { 
  label: string, 
  value: string | number, 
  icon: React.ReactNode, 
  variant?: "default" | "danger" | "success" | "warning" 
}) {
  const colors = {
    default: "text-brand-accent bg-blue-50 border-blue-100",
    success: "text-brand-success bg-emerald-50 border-emerald-100",
    danger: "text-brand-danger bg-rose-50 border-rose-100",
    warning: "text-brand-warning bg-amber-50 border-amber-100"
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="glass-card p-6 flex items-center gap-4"
    >
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", colors[variant])}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold mt-0.5">{value}</h3>
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, label, icon, count }: { 
  active: boolean, 
  onClick: () => void, 
  label: string, 
  icon: React.ReactNode, 
  count?: number 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative",
        active ? "text-brand-ink" : "text-brand-muted hover:text-brand-ink"
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="bg-brand-danger text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {count}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-ink"
        />
      )}
    </button>
  );
}
