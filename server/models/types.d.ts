export type DayChar = 'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S';

export interface CourseRecord {
  id: number;
  subject: string;
  number: string;
  title: string;
  section: string;
  section_act: string;
  days: string;
  start: string | number | null;
  end: string | number | null;
  bldg: string;
  room: string;
  assigned_bldg: string;
  assigned_room: string;
  course_id: string;
  days_list: DayChar[];
  start_min: number | null;
  end_min: number | null;
  is_lab: boolean;
  conflict_flag: boolean;
  conflict_note: string;
  resolution_action: string;
  _original_row: Record<string, unknown>;
  _keys: Record<string, string>;
  _excel_row_number: number;
}

export interface Suggestion {
  id: string;
  roomKey: string;
  newStartMin: number;
  newEndMin: number;
  newDays: string;
  newDaysList: DayChar[];
  label: string;
  timeLabel: string;
  dayLabel: string;
  resolutionNote: string;
}

export interface Conflict {
  id: string;
  pair_key: string;
  row_index: number;
  other_row_index: number;
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

export interface ConflictSummary {
  totalRecords: number;
  rowsWithConflicts: number;
  totalConflicts: number;
  uniqueConflictPairs: number;
  conflictsByDay: Record<string, number>;
  conflictsByRoom: Record<string, number>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
