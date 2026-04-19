import { describe, expect, test } from '@jest/globals';

import { detectConflicts } from '../../services/conflictDetector.js';
import { applySuggestion, autoResolve } from '../../services/resolver.js';
import { generateSuggestions } from '../../services/suggestions.js';

const records = [
  {
    id: 0,
    subject: 'CS',
    number: '101',
    title: 'Intro Programming',
    section: '01',
    section_act: 'LEC',
    days: 'MW',
    start: '09:00',
    end: '10:00',
    bldg: 'B1',
    room: '101',
    assigned_bldg: 'B1',
    assigned_room: '101',
    course_id: 'CS-101-01',
    days_list: ['M', 'W'],
    start_min: 540,
    end_min: 600,
    is_lab: false,
    conflict_flag: false,
    conflict_note: '',
    resolution_action: '',
    _original_row: {},
    _keys: {},
    _excel_row_number: 2,
  },
  {
    id: 1,
    subject: 'MATH',
    number: '201',
    title: 'Calculus I',
    section: '02',
    section_act: 'LEC',
    days: 'MW',
    start: '09:30',
    end: '10:30',
    bldg: 'B1',
    room: '101',
    assigned_bldg: 'B1',
    assigned_room: '101',
    course_id: 'MATH-201-02',
    days_list: ['M', 'W'],
    start_min: 570,
    end_min: 630,
    is_lab: false,
    conflict_flag: false,
    conflict_note: '',
    resolution_action: '',
    _original_row: {},
    _keys: {},
    _excel_row_number: 3,
  },
  {
    id: 2,
    subject: 'CHEM',
    number: '220',
    title: 'Organic Lab',
    section: '03',
    section_act: 'LAB',
    days: 'MW',
    start: '12:00',
    end: '13:00',
    bldg: 'B1',
    room: '102',
    assigned_bldg: 'B1',
    assigned_room: '102',
    course_id: 'CHEM-220-03',
    days_list: ['M', 'W'],
    start_min: 720,
    end_min: 780,
    is_lab: true,
    conflict_flag: false,
    conflict_note: '',
    resolution_action: '',
    _original_row: {},
    _keys: {},
    _excel_row_number: 4,
  },
];

describe('resolver', () => {
  test('auto-resolve moves a conflicting course into a free room', () => {
    const result = autoResolve(records, { allowTimeShift: false, prioritizeLabs: true });

    expect(result.resolvedCount).toBeGreaterThanOrEqual(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.records.some((record) => record.resolution_action.startsWith('Auto-resolved'))).toBe(true);
  });

  test('applySuggestion updates the selected conflict using a generated suggestion', () => {
    const conflictState = detectConflicts(records);
    const conflict = conflictState.conflicts[0];
    const suggestions = generateSuggestions(conflictState.records, conflictState.conflicts, conflict.id, {
      allowTimeShift: false,
    });

    const result = applySuggestion(conflictState.records, conflictState.conflicts, conflict.id, suggestions[0]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.records[conflict.row_index].resolution_action).toContain('Manually resolved');
  });
});
