import { useCallback, useEffect, useState } from 'react';
import { mapRepository } from '../../db/mapRepository';
import { navigate } from '../../lib/router';
import { formatDate } from '../../lib/format';
import type { MindMapSummary } from '../../model/types';

export function MapListPage() {
  const [maps, setMaps] = useState<MindMapSummary[] | null>(null);
  const reload = useCallback(() => mapRepository.list().then(setMaps), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async () => navigate.toEditor((await mapRepository.create()).id);

  return (
    <div className="list-page">
      <header className="list-header">
        <h1>マインドマップ</h1>
        <button className="btn btn-primary" onClick={create}>
          ＋ 新規作成
        </button>
      </header>
      <main>
        <h2 className="list-section-title">作成済みのマップ</h2>
        {maps === null ? null : maps.length === 0 ? (
          <p className="list-empty">まだマインドマップがありません。「＋ 新規作成」から作成してください。</p>
        ) : (
          <ul className="card-grid">
            {maps.map((m) => (
              <MapCard key={m.id} map={m} onChanged={reload} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function MapCard({ map, onChanged }: { map: MindMapSummary; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(map.title);

  const commitRename = async () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== map.title) {
      await mapRepository.rename(map.id, t);
      onChanged();
    } else setTitle(map.title);
  };

  const createNextDay = async () => {
    await mapRepository.createNextDay(map.id);
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`「${map.title}」を削除しますか？この操作は元に戻せません。`)) return;
    await mapRepository.remove(map.id);
    onChanged();
  };

  return (
    <li className="card">
      {editing ? (
        <input
          className="card-title-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
            if (e.key === 'Escape') {
              setTitle(map.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="card-body" onClick={() => navigate.toEditor(map.id)} title="開く">
          <span className="card-title">{map.title}</span>
        </button>
      )}
      <div className="card-footer">
        <span className="card-date" title={`作成日 ${formatDate(map.createdAt)}`}>
          更新 {formatDate(map.updatedAt)}
        </span>
        <span className="card-actions">
          <button className="btn-link" onClick={createNextDay} title="未完了の親タスクを引き継いだ翌日のマップを作成">
            次の日のタスクを作成
          </button>
          <button className="btn-link" onClick={() => setEditing(true)}>
            名前変更
          </button>
          <button className="btn-link danger" onClick={remove}>
            削除
          </button>
        </span>
      </div>
    </li>
  );
}
