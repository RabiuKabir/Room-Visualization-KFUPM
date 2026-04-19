import { ApiError } from '../middleware/errorHandler.js';
import { DAY_ORDER } from '../models/types.js';
import { buildOccupancyMap, findConflict, isSlotFree } from './conflictDetector.js';
import { DAY_LABELS, formatTime, getTimeOffsets } from './scheduleUtils.js';

function getUniqueRooms(records) {
  return [...new Set(records.map((record) => `${record.assigned_bldg}|${record.assigned_room}`))]
    .filter((roomKey) => roomKey !== '|' && roomKey !== '')
    .map((roomKey) => roomKey.split('|'));
}

function buildSuggestionId(roomKey, newDays, newStartMin, newEndMin) {
  return `${roomKey}|${newDays}|${newStartMin}|${newEndMin}`;
}

function buildDayVariations(days, daysList) {
  const normalizedDays = String(days || '').trim().toUpperCase();
  const variations = [{ days: normalizedDays, daysList }];

  if (normalizedDays === 'M') {
    variations.push({ days: 'W', daysList: ['W'] });
  } else if (normalizedDays === 'W') {
    variations.push({ days: 'M', daysList: ['M'] });
  } else if (normalizedDays === 'T') {
    variations.push({ days: 'R', daysList: ['R'] });
  } else if (normalizedDays === 'R') {
    variations.push({ days: 'T', daysList: ['T'] });
  } else if (normalizedDays === 'MW') {
    variations.push({ days: 'TR', daysList: ['T', 'R'] });
  } else if (normalizedDays === 'TR') {
    variations.push({ days: 'MW', daysList: ['M', 'W'] });
  }

  return variations.filter(
    (variation, index, source) =>
      variation.days &&
      variation.daysList.every((day) => DAY_ORDER.includes(day)) &&
      source.findIndex((candidate) => candidate.days === variation.days) === index,
  );
}

export function generateSuggestions(records, conflicts, conflictId, options = {}) {
  const conflict = findConflict(conflicts, conflictId);

  if (!conflict) {
    throw new ApiError(404, `Conflict '${conflictId}' was not found in the current session.`, undefined, 'CONFLICT_NOT_FOUND');
  }

  const course = records[conflict.row_index];

  if (!course || course.start_min === null || course.end_min === null || !course.days_list.length) {
    throw new ApiError(400, 'The selected conflict does not have enough scheduling data to generate suggestions.', undefined, 'CONFLICT_NOT_SUGGESTABLE');
  }

  const duration = course.end_min - course.start_min;
  const occupancy = buildOccupancyMap(records);
  const dayVariations = buildDayVariations(course.days, course.days_list);
  const timeOffsets = getTimeOffsets(Boolean(options.allowTimeShift), 'suggestions');
  const rooms = getUniqueRooms(records);
  const allSuggestions = [];
  const seen = new Set();

  for (const dayVariation of dayVariations) {
    for (const offset of timeOffsets) {
      const newStartMin = course.start_min + offset;
      const newEndMin = newStartMin + duration;

      if (newStartMin < 8 * 60 || newEndMin > 20 * 60) {
        continue;
      }

      for (const [bldg, room] of rooms) {
        if (!isSlotFree(records, occupancy, conflict.row_index, bldg, room, dayVariation.daysList, newStartMin, newEndMin)) {
          continue;
        }

        const roomKey = `${bldg}|${room}`;
        const suggestionId = buildSuggestionId(roomKey, dayVariation.days, newStartMin, newEndMin);
        if (seen.has(suggestionId)) {
          continue;
        }

        seen.add(suggestionId);
        allSuggestions.push({
          id: suggestionId,
          roomKey,
          newStartMin,
          newEndMin,
          newDays: dayVariation.days,
          newDaysList: [...dayVariation.daysList],
          label: `${bldg} - ${room}`,
          timeLabel: `${formatTime(newStartMin)} - ${formatTime(newEndMin)}${offset !== 0 ? ' (Shifted)' : ''}`,
          dayLabel: `${dayVariation.days}${dayVariation.days !== course.days ? ' (Shifted)' : ''}`,
          resolutionNote: `Moved to ${bldg}-${room} on ${dayVariation.days} at ${formatTime(newStartMin)}`,
        });

        if (allSuggestions.length >= 100) {
          break;
        }
      }

      if (allSuggestions.length >= 100) {
        break;
      }
    }

    if (allSuggestions.length >= 100) {
      break;
    }
  }

  const currentDayTime = allSuggestions.filter(
    (suggestion) => suggestion.newDays === course.days && suggestion.newStartMin === course.start_min,
  );
  const currentDayShifted = allSuggestions.filter(
    (suggestion) => suggestion.newDays === course.days && suggestion.newStartMin !== course.start_min,
  );
  const alternateDay = allSuggestions.filter((suggestion) => suggestion.newDays !== course.days);

  const prioritized = [...currentDayTime.slice(0, 4), ...currentDayShifted.slice(0, 4), ...alternateDay.slice(0, 4)];

  if (prioritized.length < 8) {
    const additional = allSuggestions
      .filter((suggestion) => !prioritized.some((candidate) => candidate.id === suggestion.id))
      .slice(0, 8 - prioritized.length);
    prioritized.push(...additional);
  }

  return prioritized;
}
