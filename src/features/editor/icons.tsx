import type { TaskStatus } from '../../model/types';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '未着手',
  doing: '進行中',
  waiting: '先方待ち',
};

export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'waiting'];

export function StatusIcon({ status, size = 16 }: { status: TaskStatus; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className={`status-icon status-${status}`}>
      <circle cx="8" cy="8" r="7.5" fill="#fff" />
      {status === 'todo' && <circle cx="8" cy="8" r="5.5" fill="none" stroke="#8a909c" strokeWidth="1.6" />}
      {status === 'doing' && (
        <>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="#2f7ae5" strokeWidth="1.6" />
          <path d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" fill="#2f7ae5" />
        </>
      )}
      {status === 'waiting' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="#f08c00" />
          <path d="M8 4.6 V8.3 L10.4 9.7" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

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
