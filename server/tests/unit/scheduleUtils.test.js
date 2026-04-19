import { describe, expect, test } from '@jest/globals';

import { parseDays, parseTime, formatTime } from '../../services/scheduleUtils.js';

describe('scheduleUtils', () => {
  test('parses days from multiple input formats', () => {
    expect(parseDays('Mon/Wed')).toEqual(['M', 'W']);
    expect(parseDays('TR')).toEqual(['T', 'R']);
    expect(parseDays('Tuesday Thursday')).toEqual(['T', 'R']);
  });

  test('parses time values from strings, numbers, and Excel serials', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('930')).toBe(570);
    expect(parseTime('9:30 AM')).toBe(570);
    expect(parseTime(0.5)).toBe(720);
    expect(parseTime(45200.75)).toBe(1080);
  });

  test('formats time in HH:MM format', () => {
    expect(formatTime(570)).toBe('09:30');
  });
});
