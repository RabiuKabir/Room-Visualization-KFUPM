import { describe, expect, test } from "@jest/globals";

import { detectConflicts } from "../../services/conflictDetector.js";

const baseRecord = {
  subject: "CS",
  number: "101",
  title: "Course",
  section: "01",
  section_act: "LEC",
  days: "MW",
  start: "09:00",
  end: "10:00",
  bldg: "B1",
  room: "101",
  assigned_bldg: "B1",
  assigned_room: "101",
  days_list: ["M", "W"],
  is_lab: false,
  conflict_flag: false,
  conflict_note: "",
  resolution_action: "",
  _original_row: {},
  _keys: {},
  _excel_row_number: 2,
};

describe("conflictDetector", () => {
  test("detects overlapping room conflicts for both affected records", () => {
    const records = [
      {
        ...baseRecord,
        id: 0,
        course_id: "CS-101-01",
        start_min: 540,
        end_min: 600,
      },
      {
        ...baseRecord,
        id: 1,
        course_id: "MATH-201-02",
        start_min: 570,
        end_min: 630,
      },
      {
        ...baseRecord,
        id: 2,
        course_id: "BIO-300-01",
        assigned_room: "102",
        room: "102",
        start_min: 570,
        end_min: 630,
      },
    ];

    const result = detectConflicts(records);

    expect(result.conflicts).toHaveLength(2);
    expect(result.summary.uniqueConflictPairs).toBe(1);
    expect(result.summary.rowsWithConflicts).toBe(2);
    expect(result.records[0].conflict_flag).toBe(true);
    expect(result.records[1].conflict_flag).toBe(true);
    expect(result.records[2].conflict_flag).toBe(false);
  });
});
