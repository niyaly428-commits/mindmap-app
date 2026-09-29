import { describe, expect, it } from 'vitest';
import { dueState, formatDue, toISODate } from './date';

const today = new Date(2026, 8, 29);

describe('due date helpers', () => {
  it('formats local dates', () => {
    expect(toISODate(new Date(2026, 9, 3))).toBe('2026-10-03');
    expect(formatDue('2026-10-03', today)).toBe('10/3');
    expect(formatDue('2027-01-05', today)).toBe('2027/1/5');
  });
  it('classifies due dates relative to today', () => {
    expect(dueState('2026-09-28', today)).toBe('overdue');
    expect(dueState('2026-09-29', today)).toBe('today');
    expect(dueState('2026-10-01', today)).toBe('upcoming');
  });
});
