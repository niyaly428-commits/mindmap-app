/** Local date as "YYYY-MM-DD" (the format of <input type="date"> and `MindNode.dueDate`). */
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

/** Short label for a due date: "10/3", or "2027/1/5" when not in the current year. */
export function formatDue(iso: string, today = new Date()): string {
  const { y, m, d } = parse(iso);
  return y === today.getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export type DueState = 'overdue' | 'today' | 'upcoming';

/** Classifies a due date relative to today (for future "today" / "overdue" highlighting). */
export function dueState(iso: string, today = new Date()): DueState {
  const t = toISODate(today);
  return iso < t ? 'overdue' : iso === t ? 'today' : 'upcoming';
}
