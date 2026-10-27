import { useCallback, useEffect, useMemo, useState } from 'react';
import { mapRepository } from '../../db/mapRepository';
import { navigate } from '../../lib/router';
import { formatDate } from '../../lib/format';
import type { MindMapDoc, MindMapSummary } from '../../model/types';
import { addDaysToDateKey, sortTimelineMaps, todayDateKey } from '../../model/timeline';
import { CloudSyncControls } from '../../sync/CloudSyncControls';
import { DailyReportDialog } from './DailyReportDialog';

export function MapListPage() {
  const [maps, setMaps] = useState<MindMapSummary[] | null>(null);
  const [reportDoc, setReportDoc] = useState<MindMapDoc | null>(null);
  const reload = useCallback(() => mapRepository.list().then(setMaps), []);

  useEffect(() => {
    reload();
    window.addEventListener('mindmap:local-change', reload);
    return () => window.removeEventListener('mindmap:local-change', reload);
  }, [reload]);

  const days = useMemo(() => {
    if (!maps) return [];
    const sorted = sortTimelineMaps(maps);
    const grouped = new Map<string, MindMapSummary[]>();
    for (const map of sorted) {
      const date = map.mapDate ?? todayDateKey(new Date(map.createdAt));
      grouped.set(date, [...(grouped.get(date) ?? []), map]);
    }
    return [...grouped.entries()];
  }, [maps]);

  const createToday = async () => {
    const map = await mapRepository.createForDate(todayDateKey());
    navigate.toEditor(map.id);
  };

  const openReport = async (mapId: string) => {
    const doc = await mapRepository.get(mapId);
    if (doc) setReportDoc(doc);
  };

  return (
    <div className="list-page timeline-page">
      <header className="list-header">
        <h1>日付別タイムライン</h1>
        <div className="list-header-actions">
          <CloudSyncControls />
          <button className="btn btn-primary" onClick={createToday}>今日のマップを開く／作成</button>
        </div>
      </header>
      <main className="timeline" aria-label="日付別マインドマップ">
        {maps === null ? null : maps.length === 0 ? (
          <p className="list-empty">まだ日付別マップがありません。「今日のマップを開く／作成」から始められます。</p>
        ) : days.map(([date, dayMaps]) => (
          <section className="timeline-day" key={date} aria-labelledby={`day-${date}`}>
            <header className="timeline-day-heading">
              <h2 id={`day-${date}`}>{formatTimelineHeading(date)}</h2>
              <span>{dayMaps.length === 1 ? '1 map' : `${dayMaps.length} maps`}</span>
            </header>
            {dayMaps.length > 1 && <p className="timeline-legacy-note">この日付には既存マップが複数あります。内容を保持して個別に表示しています。</p>}
            <ul className="timeline-cards">
              {dayMaps.map((map) => (
                <MapCard key={map.id} map={map} onChanged={reload} onReport={() => openReport(map.id)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
      {reportDoc && <DailyReportDialog doc={reportDoc} onClose={() => { setReportDoc(null); void reload(); }} />}
    </div>
  );
}

function formatTimelineHeading(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.toLocaleDateString('ja-JP', { weekday: 'short' });
  const today = todayDateKey();
  const relative = key === today ? '今日' : key === addDaysToDateKey(today, -1) ? '昨日' : '';
  return `${relative ? `${relative}・` : ''}${year}年${month}月${day}日（${weekday}）`;
}

function MapCard({ map, onChanged, onReport }: { map: MindMapSummary; onChanged: () => void; onReport: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(map.title);

  const commitRename = async () => {
    setEditing(false);
    const nextTitle = title.trim();
    if (nextTitle && nextTitle !== map.title) {
      await mapRepository.rename(map.id, nextTitle);
      onChanged();
    } else setTitle(map.title);
  };

  const createNextDay = async () => {
    const next = await mapRepository.createNextDay(map.id);
    onChanged();
    if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async () => {
    if (!window.confirm(`「${map.title}」を削除しますか？この操作は元に戻せません。`)) return;
    await mapRepository.remove(map.id);
    onChanged();
  };

  return (
    <li className="card timeline-card">
      {editing ? (
        <input
          className="card-title-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
            if (e.key === 'Escape') { setTitle(map.title); setEditing(false); }
          }}
        />
      ) : (
        <button className="card-body" onClick={() => navigate.toEditor(map.id)} title="マップを開く">
          <span className="card-title">{map.title}</span>
        </button>
      )}
      <div className="card-footer">
        <span className="card-date" title={`作成日 ${formatDate(map.createdAt)}`}>更新 {formatDate(map.updatedAt)}</span>
        <span className="card-actions timeline-card-actions">
          <button className="btn-link" onClick={onReport}>日報</button>
          <button className="btn-link" onClick={createNextDay} title="未完了・ルーティンタスクを引き継いだ翌日マップを作成">次の日を作成</button>
          <button className="btn-link" onClick={() => setEditing(true)}>名前変更</button>
          <button className="btn-link danger" onClick={remove}>削除</button>
        </span>
      </div>
    </li>
  );
}
