import type { DisplayStatus } from '../model/types';

/** Local date as "YYYY-MM-DD" (the format of <input type="date"> and `MindNode.dueDate`). */
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type DateParts = { year: number; month: number; day: number };

/** Parse a calendar date without asking the runtime to interpret a local timestamp. */
function parseDateOnly(value: string): DateParts | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

const utcDay = ({ year, month, day }: DateParts) => Date.UTC(year, month - 1, day) / 86_400_000;

/** Short label for a due date: "10/3", or "2027/1/5" when not in the current year. */
export function formatDue(iso: string, today = new Date()): string {
  const date = parseDateOnly(iso);
  if (!date) return iso;
  return date.year === today.getFullYear()
    ? `${date.month}/${date.day}`
    : `${date.year}/${date.month}/${date.day}`;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'month' | 'upcoming';

/** Classifies a due date relative to today (for future "today" / "overdue" highlighting). */
export function dueState(iso: string, today = new Date()): DueState {
  const due = parseDateOnly(iso);
  const current = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
  if (!due) return 'upcoming';
  const days = utcDay(due) - utcDay(current);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= 7 ? 'soon' : days <= 30 ? 'month' : 'upcoming';
}

/** Completed tasks keep their due date but no longer show urgency coloring. */
export function taskDueState(iso: string | undefined, status: DisplayStatus, today = new Date()): DueState | null {
  if (!iso || status === 'done') return null;
  return dueState(iso, today);
}
