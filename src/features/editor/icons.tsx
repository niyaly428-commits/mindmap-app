import type { DisplayStatus, TextColor } from '../../model/types';

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  todo: '未着手',
  doing: '進行中',
  waiting: '待ち',
  done: '完了',
};

export const STATUS_ORDER: DisplayStatus[] = ['todo', 'doing', 'waiting', 'done'];

export const TEXT_COLORS: { value: TextColor; label: string; css: string }[] = [
  { value: 'black', label: '黒', css: '#1f2328' },
  { value: 'red', label: '赤', css: '#e03131' },
  { value: 'blue', label: '青', css: '#1c64d6' },
  { value: 'orange', label: 'オレンジ', css: '#e8590c' },
];

/** One icon that is both the status and the completion checkbox (完了 = checked box). */
export function StatusIcon({ status, size = 16 }: { status: DisplayStatus; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className={`status-icon status-${status}`}>
      {status === 'done' ? (
        <>
          <rect x="1" y="1" width="14" height="14" rx="3.5" fill="var(--branch, #3fb1a7)" stroke="#fff" strokeWidth="1.2" />
          <path d="M4.4 8.3 L7 10.8 L11.8 5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#fff" stroke={STROKES[status]} strokeWidth="1.5" />
      )}
      {status === 'doing' && <path d="M8 4.2 A3.8 3.8 0 0 1 8 11.8 Z" fill="#2f7ae5" />}
      {status === 'waiting' && (
        <>
          <circle cx="8" cy="8" r="4.2" fill="none" stroke="#f08c00" strokeWidth="1.4" />
          <path d="M8 5.8 V8.2 L9.6 9.2" fill="none" stroke="#f08c00" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

const STROKES: Record<Exclude<DisplayStatus, 'done'>, string> = { todo: '#8a909c', doing: '#2f7ae5', waiting: '#f08c00' };

export function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function LinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6.8 9.2a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.9.9" strokeLinecap="round" />
      <path d="M9.2 6.8a3 3 0 0 0-4.2 0L2.9 8.9a3 3 0 0 0 4.2 4.2l.9-.9" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
    </svg>
  );
}

export type ToolbarIconName = 'child' | 'sibling' | 'delete' | 'focus';

/** Compact line icons used by the editor's primary task actions. */
export function ToolbarIcon({ name, size = 17 }: { name: ToolbarIconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  return <svg {...common}>
    {name === 'child' && <><circle cx="5" cy="4" r="2" /><circle cx="14.5" cy="15.5" r="2" /><path d="M5 6v4.5c0 2 1.5 3 3.5 3h4" /><path d="m11 11 2 2-2 2" /></>}
    {name === 'sibling' && <><circle cx="5" cy="4" r="2" /><circle cx="14.5" cy="11" r="2" /><circle cx="14.5" cy="17" r="2" /><path d="M5 6v5c0 1 .8 2 2 2h5" /><path d="M7 13h5" /><path d="m11 11 2 2-2 2" /></>}
    {name === 'delete' && <><path d="M3.5 5.5h13M8 3h4l1 2.5H7L8 3Z" /><path d="m5.5 6 .8 10h7.4l.8-10M8.5 8.5v5M11.5 8.5v5" /></>}
    {name === 'focus' && <><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.5" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></>}
  </svg>;
}
