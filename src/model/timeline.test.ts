import { describe, expect, it } from 'vitest';
import { mapDateOf, sortTimelineMaps, addDaysToDateKey, groupTimelineMaps } from './timeline';

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

  it('uses legacy title dates when grouping summaries without a normalized mapDate', () => {
    const maps = [
      { id: 'older', title: 'タスク_10月24日', createdAt: new Date(2026, 9, 27).getTime(), updatedAt: 1 },
      { id: 'today', title: 'タスク_10月27日', createdAt: new Date(2026, 9, 20).getTime(), updatedAt: 2 },
    ];
    const groups = groupTimelineMaps(maps, '2026-10-27');

    expect(groups.recentDays.map(({ date }) => date)).toEqual(['2026-10-27']);
    expect(groups.olderMonths.map(({ month }) => month)).toEqual(['2026-10']);
    expect(groups.olderMonths[0].maps.map(({ id }) => id)).toEqual(['older']);
  });

  it('advances calendar dates across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('groups the last three calendar days separately and older maps by month without dropping same-day maps', () => {
    const maps = [
      { id: 'sep-old', title: 'Sep old', createdAt: 1, updatedAt: 1, mapDate: '2026-09-02' },
      { id: 'today', title: 'Today', createdAt: 2, updatedAt: 2, mapDate: '2026-10-27' },
      { id: 'oct-old', title: 'Oct old', createdAt: 3, updatedAt: 3, mapDate: '2026-10-24' },
      { id: 'yesterday', title: 'Yesterday', createdAt: 4, updatedAt: 4, mapDate: '2026-10-26' },
      { id: 'two-days-new', title: 'Two days new', createdAt: 5, updatedAt: 7, mapDate: '2026-10-25' },
      { id: 'sep-new', title: 'Sep new', createdAt: 6, updatedAt: 6, mapDate: '2026-09-30' },
      { id: 'two-days-old', title: 'Two days old', createdAt: 7, updatedAt: 5, mapDate: '2026-10-25' },
      { id: 'pinned', title: 'Pinned', createdAt: 8, updatedAt: 8, mapDate: '2026-08-01', pinned: true },
      { id: 'future', title: 'Future', createdAt: 9, updatedAt: 9, mapDate: '2026-10-31' },
    ];
    const groups = groupTimelineMaps(maps, '2026-10-27');

    expect(groups.pinned.map((map) => map.id)).toEqual(['pinned']);
    expect(groups.futureDays.map((group) => group.date)).toEqual(['2026-10-31']);
    expect(groups.recentDays.map((group) => group.date)).toEqual(['2026-10-27', '2026-10-26', '2026-10-25']);
    expect(groups.recentDays[2].maps.map((map) => map.id)).toEqual(['two-days-new', 'two-days-old']);
    expect(groups.olderMonths.map((group) => group.month)).toEqual(['2026-10', '2026-09']);
    expect(groups.olderMonths[0].maps.map((map) => map.id)).toEqual(['oct-old']);
    expect(groups.olderMonths[1].maps.map((map) => map.id)).toEqual(['sep-new', 'sep-old']);
  });

});
