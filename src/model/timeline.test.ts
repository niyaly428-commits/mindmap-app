import { describe, expect, it } from 'vitest';
import { mapDateOf, sortTimelineMaps, addDaysToDateKey } from './timeline';

describe('daily timeline dates', () => {
  it('sorts newest dates first and keeps same-day maps stable by update time', () => {
    const maps = [
      { id: 'old', title: 'old', createdAt: 1, updatedAt: 1, mapDate: '2026-09-28' },
      { id: 'today-old', title: 'old revision', createdAt: 2, updatedAt: 2, mapDate: '2026-09-30' },
      { id: 'today-new', title: 'new revision', createdAt: 3, updatedAt: 3, mapDate: '2026-09-30' },
    ];
    expect(sortTimelineMaps(maps).map((map) => map.id)).toEqual(['today-new', 'today-old', 'old']);
  });

  it('uses explicit map dates first, then legacy title dates, then creation dates', () => {
    expect(mapDateOf({ mapDate: '2026-10-01', title: '2026-10-02', createdAt: 0 })).toBe('2026-10-01');
    expect(mapDateOf({ title: 'タスク_9月30日', createdAt: new Date(2026, 8, 29).getTime() })).toBe('2026-09-30');
    expect(mapDateOf({ title: 'Planning', createdAt: new Date(2026, 8, 29).getTime() })).toBe('2026-09-29');
  });

  it('advances calendar dates across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

});
