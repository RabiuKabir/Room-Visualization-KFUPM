import { DAY_ORDER } from "../models/types.js";
import { cloneRecords, formatTime, overlaps } from "./scheduleUtils.js";

export function createConflictId(rowIndex, otherRowIndex, day, bldg, room) {
  return `${rowIndex}-${otherRowIndex}-${day}-${bldg || "NA"}-${room || "NA"}`;
}

export function buildOccupancyMap(records) {
  const occupancy = {};

  records.forEach((record, index) => {
    if (
      !record.assigned_bldg ||
      !record.assigned_room ||
      !record.days_list.length ||
      record.start_min === null ||
      record.end_min === null
    ) {
      return;
    }

    record.days_list.forEach((day) => {
      const key = `${day}|${record.assigned_bldg}|${record.assigned_room}`;
      occupancy[key] ||= [];
      occupancy[key].push(index);
    });
  });

  return occupancy;
}

function buildSummary(records, conflicts) {
  const conflictRows = new Set(
    records.filter((record) => record.conflict_flag).map((record) => record.id),
  );
  const pairKeys = new Set(conflicts.map((conflict) => conflict.pair_key));
  const conflictsByDay = DAY_ORDER.reduce((accumulator, day) => {
    accumulator[day] = conflicts.filter(
      (conflict) => conflict.day === day,
    ).length;
    return accumulator;
  }, {});

  const conflictsByRoom = conflicts.reduce((accumulator, conflict) => {
    const roomKey = `${conflict.assigned_bldg}-${conflict.assigned_room}`;
    accumulator[roomKey] = (accumulator[roomKey] || 0) + 1;
    return accumulator;
  }, {});

  return {
    totalRecords: records.length,
    rowsWithConflicts: conflictRows.size,
    totalConflicts: conflicts.length,
    uniqueConflictPairs: pairKeys.size,
    conflictsByDay,
    conflictsByRoom,
  };
}

export function detectConflicts(records) {
  const nextRecords = cloneRecords(records).map((record) => ({
    ...record,
    conflict_flag: false,
    conflict_note: "",
  }));

  const occupancy = buildOccupancyMap(nextRecords);
  const noteMap = new Map();
  const conflicts = [];
  const seenPairs = new Set();

  Object.entries(occupancy).forEach(([key, indices]) => {
    const [day, bldg, room] = key.split("|");
    const sortedIndices = [...indices].sort(
      (left, right) =>
        (nextRecords[left].start_min || 0) -
        (nextRecords[right].start_min || 0),
    );

    // Sorting by start time lets us stop scanning a bucket as soon as later classes can no longer overlap.
    for (let i = 0; i < sortedIndices.length; i += 1) {
      for (let j = i + 1; j < sortedIndices.length; j += 1) {
        const leftIndex = sortedIndices[i];
        const rightIndex = sortedIndices[j];
        const leftRecord = nextRecords[leftIndex];
        const rightRecord = nextRecords[rightIndex];

        if (
          leftRecord.start_min === null ||
          leftRecord.end_min === null ||
          rightRecord.start_min === null ||
          rightRecord.end_min === null
        ) {
          continue;
        }

        if (rightRecord.start_min >= leftRecord.end_min) {
          break;
        }

        if (
          !overlaps(
            leftRecord.start_min,
            leftRecord.end_min,
            rightRecord.start_min,
            rightRecord.end_min,
          )
        ) {
          continue;
        }

        const pairKey = [
          Math.min(leftIndex, rightIndex),
          Math.max(leftIndex, rightIndex),
          bldg,
          room,
        ].join("|");
        seenPairs.add(pairKey);

        const conflictId = createConflictId(
          leftIndex,
          rightIndex,
          day,
          bldg,
          room,
        );
        conflicts.push({
          id: conflictId,
          pair_key: pairKey,
          row_index: leftIndex,
          other_row_index: rightIndex,
          course_id: leftRecord.course_id,
          day,
          time: `${formatTime(leftRecord.start_min)}-${formatTime(leftRecord.end_min)}`,
          assigned_bldg: bldg,
          assigned_room: room,
          type: "hard",
          reason: "Room Overlap",
          other_course: rightRecord.course_id,
          suggestions: "",
        });

        noteMap.set(leftIndex, [
          ...(noteMap.get(leftIndex) || []),
          `${rightRecord.course_id} in ${bldg}-${room}`,
        ]);
        noteMap.set(rightIndex, [
          ...(noteMap.get(rightIndex) || []),
          `${leftRecord.course_id} in ${bldg}-${room}`,
        ]);
      }
    }
  });

  noteMap.forEach((messages, rowIndex) => {
    nextRecords[rowIndex].conflict_flag = true;
    nextRecords[rowIndex].conflict_note =
      `CONFLICT: Overlaps with ${[...new Set(messages)].join(", ")}`;
  });

  return {
    records: nextRecords,
    conflicts,
    summary: buildSummary(nextRecords, conflicts),
    occupancy,
    uniquePairs: [...seenPairs],
  };
}

export function findConflict(conflicts, conflictId) {
  return conflicts.find((conflict) => conflict.id === conflictId) || null;
}

export function isSlotFree(
  records,
  occupancy,
  movingRowIndex,
  bldg,
  room,
  daysList,
  newStart,
  newEnd,
) {
  return daysList.every((day) => {
    const key = `${day}|${bldg}|${room}`;
    return !(occupancy[key] || []).some((otherIndex) => {
      if (otherIndex === movingRowIndex) {
        return false;
      }

      const other = records[otherIndex];
      return (
        other.start_min !== null &&
        other.end_min !== null &&
        overlaps(newStart, newEnd, other.start_min, other.end_min)
      );
    });
  });
}
