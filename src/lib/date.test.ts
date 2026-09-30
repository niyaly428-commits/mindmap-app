import { describe, expect, it } from 'vitest';
import { dueState, formatDue, taskDueState, toISODate } from './date';

const today = new Date(2026, 8, 30, 12);

describe('due date helpers', () => {
  it('suppresses urgency coloring only while a task is completed', () => {
    for (const [date, state] of [['2026-09-30', 'today'], ['2026-09-29', 'overdue']] as const) {
      expect(taskDueState(date, 'done', today)).toBeNull();
      expect(taskDueState(date, 'todo', today)).toBe(state);
      expect(taskDueState(date, 'doing', today)).toBe(state);
      expect(taskDueState(date, 'waiting', today)).toBe(state);
    }
    expect(taskDueState(undefined, 'todo', today)).toBeNull();
  });
  it('formats local dates', () => {
    expect(toISODate(new Date(2026, 9, 3))).toBe('2026-10-03');
    expect(formatDue('2026-10-03', today)).toBe('10/3');
    expect(formatDue('2027-01-05', today)).toBe('2027/1/5');
    expect(formatDue('2026/10/07', today)).toBe('10/7');
  });
  it('classifies calendar-day distance without local-time or timezone drift', () => {
    expect(dueState('2026-09-29', today)).toBe('overdue');
    expect(dueState('2026-09-30', new Date(2026, 8, 30, 23, 59))).toBe('today');
    expect(dueState('2026-10-01', new Date(2026, 8, 30))).toBe('soon');
    expect(dueState('2026-10-07', new Date(2026, 8, 30))).toBe('soon');
    expect(dueState('2026-10-08', new Date(2026, 8, 30))).toBe('month');
    expect(dueState('2026/10/20', new Date(2026, 8, 30, 23, 59))).toBe('month');
    expect(dueState('2026-10-30', new Date(2026, 8, 30))).toBe('month');
    expect(dueState('2026-10-31', new Date(2026, 8, 30))).toBe('upcoming');
    expect(dueState('2027-02-27', new Date(2026, 8, 30))).toBe('upcoming');
    expect(dueState('2027/02/27', new Date(2026, 8, 30))).toBe('upcoming');
    expect(dueState('2027-01-01', new Date(2026, 11, 31, 23, 59))).toBe('soon');
    expect(dueState('2027/01/30', new Date(2026, 11, 31))).toBe('month');
    expect(dueState('2027/01/31', new Date(2026, 11, 31))).toBe('upcoming');
  });
});
