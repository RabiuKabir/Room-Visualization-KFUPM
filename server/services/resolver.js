import { ApiError } from '../middleware/errorHandler.js';
import { buildOccupancyMap, detectConflicts, findConflict, isSlotFree } from './conflictDetector.js';
import { cloneRecords, formatTime, getTimeOffsets } from './scheduleUtils.js';

function getRoomInventory(records) {
  return [...new Set(records.map((record) => `${record.assigned_bldg}|${record.assigned_room}`))]
    .filter((roomKey) => roomKey !== '|' && roomKey !== '')
    .map((roomKey) => roomKey.split('|'));
}

function sortConflicts(conflicts, records, prioritizeLabs) {
  return [...conflicts].sort((left, right) => {
    const leftRecord = records[left.row_index];
    const rightRecord = records[right.row_index];

    if (prioritizeLabs && leftRecord.is_lab !== rightRecord.is_lab) {
      return Number(leftRecord.is_lab) - Number(rightRecord.is_lab);
    }

    return (leftRecord.start_min || 0) - (rightRecord.start_min || 0);
  });
}

export function autoResolve(records, options = {}) {
  let workingRecords = cloneRecords(records);
  let state = detectConflicts(workingRecords);
  const rooms = getRoomInventory(workingRecords);
  const movedRows = new Set();
  const resolutionLog = [];
  const timeOffsets = getTimeOffsets(Boolean(options.allowTimeShift), 'auto-resolve');
  const prioritizeLabs = options.prioritizeLabs !== false;

  for (const conflict of sortConflicts(state.conflicts, state.records, prioritizeLabs)) {
    if (movedRows.has(conflict.row_index)) {
      continue;
    }

    const record = workingRecords[conflict.row_index];

    if (!record || record.start_min === null || record.end_min === null || !record.days_list.length) {
      resolutionLog.push({
        conflictId: conflict.id,
        status: 'skipped',
        reason: 'Missing time or day information.',
      });
      continue;
    }

    const currentConflict = findConflict(state.conflicts, conflict.id);
    if (!currentConflict) {
      continue;
    }

    const duration = record.end_min - record.start_min;
    const occupancy = buildOccupancyMap(workingRecords);
    let applied = null;

    // The resolver preserves the original day pattern and searches nearby time offsets only when enabled.
    for (const offset of timeOffsets) {
      const newStartMin = record.start_min + offset;
      const newEndMin = newStartMin + duration;

      if (newStartMin < 8 * 60 || newEndMin > 20 * 60) {
        continue;
      }

      for (const [bldg, room] of rooms) {
        if (!isSlotFree(workingRecords, occupancy, conflict.row_index, bldg, room, record.days_list, newStartMin, newEndMin)) {
          continue;
        }

        applied = { bldg, room, newStartMin, newEndMin, offset };
        break;
      }

      if (applied) {
        break;
      }
    }

    if (!applied) {
      resolutionLog.push({
        conflictId: conflict.id,
        status: 'unresolved',
        reason: 'No free room/time slot was found with the current strategy.',
      });
      continue;
    }

    workingRecords[conflict.row_index] = {
      ...workingRecords[conflict.row_index],
      assigned_bldg: applied.bldg,
      assigned_room: applied.room,
      start_min: applied.newStartMin,
      end_min: applied.newEndMin,
      start: formatTime(applied.newStartMin),
      end: formatTime(applied.newEndMin),
      resolution_action: `Auto-resolved: moved to ${applied.bldg}-${applied.room}${applied.offset !== 0 ? ` and shifted by ${applied.offset} minutes` : ''}`,
    };

    movedRows.add(conflict.row_index);
    resolutionLog.push({
      conflictId: conflict.id,
      status: 'resolved',
      resolution: workingRecords[conflict.row_index].resolution_action,
    });

    state = detectConflicts(workingRecords);
    workingRecords = state.records.map((recordItem, index) => ({
      ...recordItem,
      resolution_action: workingRecords[index].resolution_action || recordItem.resolution_action || '',
    }));
  }

  const finalState = detectConflicts(
    workingRecords.map((record) => ({
      ...record,
      conflict_note: '',
      conflict_flag: false,
    })),
  );

  const mergedRecords = finalState.records.map((record, index) => ({
    ...record,
    resolution_action: workingRecords[index].resolution_action || '',
  }));

  return {
    records: mergedRecords,
    conflicts: finalState.conflicts.map((conflict) => ({ ...conflict, type: 'needs-manual' })),
    summary: finalState.summary,
    resolvedCount: resolutionLog.filter((entry) => entry.status === 'resolved').length,
    unresolvedCount: resolutionLog.filter((entry) => entry.status === 'unresolved').length,
    resolutionLog,
  };
}

export function applySuggestion(records, conflicts, conflictId, suggestion) {
  const conflict = findConflict(conflicts, conflictId);

  if (!conflict) {
    throw new ApiError(404, `Conflict '${conflictId}' was not found in the current session.`, undefined, 'CONFLICT_NOT_FOUND');
  }

  const [bldg, room] = suggestion.roomKey.split('|');
  const workingRecords = cloneRecords(records);

  workingRecords[conflict.row_index] = {
    ...workingRecords[conflict.row_index],
    assigned_bldg: bldg,
    assigned_room: room,
    start_min: suggestion.newStartMin,
    end_min: suggestion.newEndMin,
    start: formatTime(suggestion.newStartMin),
    end: formatTime(suggestion.newEndMin),
    days: suggestion.newDays,
    days_list: [...suggestion.newDaysList],
    resolution_action: `Manually resolved: ${suggestion.resolutionNote}`,
  };

  const finalState = detectConflicts(workingRecords);
  const mergedRecords = finalState.records.map((record, index) => ({
    ...record,
    resolution_action: workingRecords[index].resolution_action || '',
  }));

  return {
    records: mergedRecords,
    conflicts: finalState.conflicts.map((item) => ({ ...item, type: 'needs-manual' })),
    summary: finalState.summary,
  };
}
