import type { MindMapDoc, MindMapSummary } from './types';

const validDateKey = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
};

export const dateKeyOf = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const todayDateKey = (now = new Date()): string => dateKeyOf(now);

export function addDaysToDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return dateKeyOf(date);
}

/** Parse explicitly dated legacy titles; use createdAt only if no date is present. */
function dateFromTitle(title: string, yearFallback: number): string | undefined {
  let match = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(title);
  if (match) {
    const value = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    return validDateKey(value) ? value : undefined;
  }
  match = /(^|\D)(\d{1,2})月(\d{1,2})日/.exec(title);
  if (!match) return undefined;
  const value = `${yearFallback}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return validDateKey(value) ? value : undefined;
}

/** Effective date for timeline display without rewriting older stored documents. */
export function mapDateOf(doc: Pick<MindMapDoc, 'mapDate' | 'title' | 'createdAt'>): string {
  if (doc.mapDate && validDateKey(doc.mapDate)) return doc.mapDate;
  const created = new Date(doc.createdAt);
  return dateFromTitle(doc.title, created.getFullYear()) ?? dateKeyOf(created);
}

export function sortTimelineMaps<T extends MindMapSummary>(maps: T[]): T[] {
  return [...maps].sort((a, b) =>
    (b.mapDate ?? dateKeyOf(new Date(b.createdAt))).localeCompare(a.mapDate ?? dateKeyOf(new Date(a.createdAt))) ||
    b.updatedAt - a.updatedAt,
  );
}

export function dateKeyToLocalDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function dailyMapTitle(dateKey: string): string {
  const date = dateKeyToLocalDate(dateKey);
  return `タスク_${date.getMonth() + 1}月${date.getDate()}日`;
}
