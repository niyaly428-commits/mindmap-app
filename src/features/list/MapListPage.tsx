import { useCallback, useEffect, useMemo, useState } from 'react';
import { mapRepository } from '../../db/mapRepository';
import { navigate } from '../../lib/router';
import { formatDate } from '../../lib/format';
import type { MindMapDoc, MindMapSummary } from '../../model/types';
import { addDaysToDateKey, groupTimelineMaps, todayDateKey } from '../../model/timeline';
import { CloudSyncControls } from '../../sync/CloudSyncControls';
import { DailyReportDialog } from './DailyReportDialog';

export function MapListPage() {
  const [maps, setMaps] = useState<MindMapSummary[] | null>(null);
  const [reportDoc, setReportDoc] = useState<MindMapDoc | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const reload = useCallback(() => mapRepository.list().then(setMaps), []);

  useEffect(() => {
    reload();
    window.addEventListener('mindmap:local-change', reload);
    return () => window.removeEventListener('mindmap:local-change', reload);
  }, [reload]);

  const sections = useMemo(() => maps ? groupTimelineMaps(maps) : null, [maps]);

  const createToday = async () => {
    const map = await mapRepository.createForDate(todayDateKey());
    navigate.toEditor(map.id);
  };

  const openReport = async (mapId: string) => {
    const doc = await mapRepository.get(mapId);
    if (doc) setReportDoc(doc);
  };

  const toggleMonth = (month: string) => setExpandedMonths((current) => {
    const next = new Set(current);
    if (next.has(month)) next.delete(month); else next.add(month);
    return next;
  });

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
        ) : sections && <>
          <section className="timeline-pinned" aria-labelledby="pinned-heading">
            <header className="timeline-pinned-heading">
              <PinIcon />
              <div><h2 id="pinned-heading">ピン留めしたマップ</h2><p>よく使うマップを上に固定できます</p></div>
              <span className="timeline-section-count">{sections.pinned.length}件</span>
            </header>
            {sections.pinned.length > 0
              ? <ul className="timeline-cards">{sections.pinned.map((map) => <MapCard key={map.id} map={map} showDate onChanged={reload} onReport={() => openReport(map.id)} />)}</ul>
              : <p className="timeline-pinned-empty">カードのピンを押すと、ここに固定できます。</p>}
          </section>

          <section className="timeline-section timeline-recent" aria-labelledby="recent-heading">
            <header className="timeline-section-heading"><h2 id="recent-heading">最近のマップ</h2><span>直近3日分を表示しています</span></header>
            {sections.recentDays.length === 0 && <p className="timeline-section-empty">今日・昨日・一昨日のマップはありません。</p>}
            {sections.recentDays.map(({ date, maps: dayMaps }) => (
              <section className="timeline-day" key={date} aria-labelledby={`day-${date}`}>
                <header className="timeline-day-heading">
                  <h3 id={`day-${date}`}>{formatTimelineHeading(date)}</h3>
                  <span>{dayMaps.length} map{dayMaps.length === 1 ? '' : 's'}</span>
                </header>
                <ul className="timeline-cards">{dayMaps.map((map) => <MapCard key={map.id} map={map} onChanged={reload} onReport={() => openReport(map.id)} />)}</ul>
              </section>
            ))}
          </section>

          {sections.futureDays.length > 0 && <section className="timeline-section timeline-future" aria-labelledby="future-heading">
            <header className="timeline-section-heading"><h2 id="future-heading">今後のマップ</h2><span>未来の日付</span></header>
            {sections.futureDays.map(({ date, maps: dayMaps }) => (
              <section className="timeline-day" key={date} aria-labelledby={`future-day-${date}`}>
                <header className="timeline-day-heading"><h3 id={`future-day-${date}`}>{formatTimelineHeading(date)}</h3><span>{dayMaps.length} map{dayMaps.length === 1 ? '' : 's'}</span></header>
                <ul className="timeline-cards">{dayMaps.map((map) => <MapCard key={map.id} map={map} onChanged={reload} onReport={() => openReport(map.id)} />)}</ul>
              </section>
            ))}
          </section>}

          {sections.olderMonths.length > 0 && <section className="timeline-section timeline-past" aria-labelledby="past-heading">
            <header className="timeline-section-heading"><h2 id="past-heading">過去のマップ</h2><span>それ以前は月ごとにまとめて表示しています</span></header>
            {sections.olderMonths.map(({ month, maps: monthMaps }) => {
              const expanded = expandedMonths.has(month);
              const monthId = month.replace('-', '');
              return <section className="timeline-month" key={month} aria-labelledby={`month-${monthId}`}>
                <button className="timeline-month-toggle" aria-expanded={expanded} aria-controls={`month-maps-${monthId}`} onClick={() => toggleMonth(month)}>
                  <span className="timeline-month-chevron" aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                  <CalendarIcon />
                  <span className="timeline-month-label" id={`month-${monthId}`}>{formatTimelineMonth(month)}</span>
                  <span className="timeline-month-count">{monthMaps.length} maps</span>
                </button>
                {expanded && <ul id={`month-maps-${monthId}`} className="timeline-cards">
                  {monthMaps.map((map) => <MapCard key={map.id} map={map} showDate onChanged={reload} onReport={() => openReport(map.id)} />)}
                </ul>}
              </section>;
            })}
          </section>}
        </>}
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
  const relative = key === today ? '今日' : key === addDaysToDateKey(today, -1) ? '昨日' : key === addDaysToDateKey(today, -2) ? '一昨日' : '';
  return `${relative ? `${relative}・` : ''}${year}年${month}月${day}日（${weekday}）`;
}

function formatTimelineMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${year}年${month}月`;
}

function formatMapDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = new Date(year, month - 1, day, 12).toLocaleDateString('ja-JP', { weekday: 'short' });
  return `${month}月${day}日（${weekday}）`;
}

function PinIcon() {
  return <svg className="timeline-pin-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5 2.5h6l-.8 3.2 2.1 2.1v1H8.5V14l-.5.7-.5-.7V8.8H3.7v-1l2.1-2.1L5 2.5Z" /></svg>;
}

function CalendarIcon() {
  return <svg className="timeline-calendar-icon" aria-hidden="true" viewBox="0 0 16 16"><rect x="2.2" y="3.5" width="11.6" height="10.2" rx="1.5" /><path d="M5 2v3M11 2v3M2.5 6.5h11" /></svg>;
}

function PinToggle({ pinned, onClick }: { pinned?: boolean; onClick: () => void }) {
  return <button className={`pin-icon-toggle${pinned ? ' is-pinned' : ''}`} onClick={onClick} aria-label={pinned ? 'ピン留め解除' : 'ピン留め'} aria-pressed={!!pinned} title={pinned ? 'ピン留めを解除' : 'ピン留め'}><PinIcon /></button>;
}

function MapCard({ map, showDate = false, onChanged, onReport }: { map: MindMapSummary; showDate?: boolean; onChanged: () => void; onReport: () => void }) {
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

  const togglePinned = async () => {
    await mapRepository.setPinned(map.id, !map.pinned);
    onChanged();
  };

  return (
    <li className={`card timeline-card${map.pinned ? ' is-pinned' : ''}`}>
      {showDate && <span className="timeline-card-date">{formatMapDate(map.mapDate ?? todayDateKey(new Date(map.createdAt)))}</span>}
      <div className="timeline-card-heading">
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
        <PinToggle pinned={map.pinned} onClick={togglePinned} />
      </div>
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
