import { z } from 'zod';

export const DAY_ORDER = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

export const DayCharSchema = z.enum(DAY_ORDER);

export const CourseRecordSchema = z.object({
  id: z.number().int().nonnegative(),
  subject: z.string(),
  number: z.string(),
  title: z.string(),
  section: z.string(),
  section_act: z.string(),
  days: z.string(),
  start: z.union([z.string(), z.number(), z.null()]).optional().default(''),
  end: z.union([z.string(), z.number(), z.null()]).optional().default(''),
  bldg: z.string(),
  room: z.string(),
  assigned_bldg: z.string(),
  assigned_room: z.string(),
  course_id: z.string(),
  days_list: z.array(DayCharSchema),
  start_min: z.number().int().nullable(),
  end_min: z.number().int().nullable(),
  is_lab: z.boolean(),
  conflict_flag: z.boolean(),
  conflict_note: z.string(),
  resolution_action: z.string(),
  _original_row: z.record(z.string(), z.any()),
  _keys: z.record(z.string(), z.string()),
  _excel_row_number: z.number().int().positive(),
});

export const SuggestionSchema = z.object({
  id: z.string(),
  roomKey: z.string(),
  newStartMin: z.number().int(),
  newEndMin: z.number().int(),
  newDays: z.string(),
  newDaysList: z.array(DayCharSchema),
  label: z.string(),
  timeLabel: z.string(),
  dayLabel: z.string(),
  resolutionNote: z.string(),
});

export const ConflictSchema = z.object({
  id: z.string(),
  pair_key: z.string(),
  row_index: z.number().int().nonnegative(),
  other_row_index: z.number().int().nonnegative(),
  course_id: z.string(),
  day: DayCharSchema,
  time: z.string(),
  assigned_bldg: z.string(),
  assigned_room: z.string(),
  type: z.enum(['hard', 'auto-resolved', 'needs-manual']),
  reason: z.string(),
  other_course: z.string(),
  suggestions: z.string(),
});

export const SummarySchema = z.object({
  totalRecords: z.number().int().nonnegative(),
  rowsWithConflicts: z.number().int().nonnegative(),
  totalConflicts: z.number().int().nonnegative(),
  uniqueConflictPairs: z.number().int().nonnegative(),
  conflictsByDay: z.record(z.string(), z.number().int().nonnegative()),
  conflictsByRoom: z.record(z.string(), z.number().int().nonnegative()),
});

export const UploadResponseSchema = z.object({
  success: z.literal(true),
  sessionId: z.string(),
  fileName: z.string(),
  records: z.array(CourseRecordSchema),
  conflicts: z.array(ConflictSchema),
  summary: SummarySchema,
  metadata: z.object({
    worksheetName: z.string(),
    headerRowIndex: z.number().int().positive(),
    detectedHeaders: z.array(z.string()),
  }),
});

export const ConflictsResponseSchema = z.object({
  success: z.literal(true),
  sessionId: z.string(),
  conflicts: z.array(ConflictSchema),
  summary: SummarySchema,
});

export const SuggestionsResponseSchema = z.object({
  success: z.literal(true),
  sessionId: z.string(),
  conflictId: z.string(),
  suggestions: z.array(SuggestionSchema),
});

export const MutationResponseSchema = z.object({
  success: z.literal(true),
  sessionId: z.string(),
  records: z.array(CourseRecordSchema),
  conflicts: z.array(ConflictSchema),
  summary: SummarySchema,
});

export const AutoResolveRequestSchema = z.object({
  sessionId: z.string().min(1),
  allowTimeShift: z.boolean().optional().default(false),
  prioritizeLabs: z.boolean().optional().default(true),
});

export const ApplySuggestionRequestSchema = z.object({
  sessionId: z.string().min(1),
  suggestion: SuggestionSchema,
});

export const ExportRequestSchema = z.object({
  sessionId: z.string().min(1),
  fileName: z.string().optional(),
});

export const ConflictParamsSchema = z.object({
  conflictId: z.string().min(1),
});

export const SuggestionsQuerySchema = z.object({
  allowTimeShift: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
      }

      return false;
    }),
});
