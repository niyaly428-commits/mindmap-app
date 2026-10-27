import { useCallback, useEffect, useRef, useState } from 'react';
import { mapRepository } from '../../db/mapRepository';
import { generateDailyReport, resolveDailyReportDraft } from '../../model/dailyReport';
import type { MindMapDoc } from '../../model/types';
import { useEditorStore } from '../../store/editorStore';

export function DailyReportDialog({ doc, onClose }: { doc: MindMapDoc; onClose: () => void }) {
  const initial = resolveDailyReportDraft(doc, doc.dailyReport);
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const [reportDoc, setReportDoc] = useState(doc);
  const [regenerating, setRegenerating] = useState(false);
  const [savedValue, setSavedValue] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));

  const save = useCallback((text: string) => {
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => mapRepository.saveDailyReport(doc.id, text))
      .then(() => { setSavedValue(text); setSaveError(false); return true; })
      .catch(() => { setSaveError(true); return false; });
    return saveQueue.current;
  }, [doc.id]);

  useEffect(() => {
    if (value === savedValue) return;
    const timer = window.setTimeout(() => { void save(value); }, 500);
    return () => window.clearTimeout(timer);
  }, [save, savedValue, value]);

  const close = async () => {
    if (!(await save(value))) return;
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const updateValue = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      // The dialog receives a snapshot when opened. Re-read persisted data on
      // every regeneration, then prefer a newer in-memory editor document when
      // the same map is still loaded (for edits not yet autosaved).
      const persistedDoc = await mapRepository.get(doc.id);
      const editorDoc = useEditorStore.getState().doc;
      const latestDoc = editorDoc?.id === doc.id && (!persistedDoc || editorDoc.updatedAt >= persistedDoc.updatedAt)
        ? editorDoc
        : persistedDoc ?? (editorDoc?.id === doc.id ? editorDoc : doc);
      const nextReport = generateDailyReport(latestDoc);
      if (valueRef.current !== nextReport && !window.confirm('現在の日報を生成内容で置き換えます。編集内容は失われます。続けますか？')) return;
      setReportDoc(latestDoc);
      updateValue(nextReport);
    } finally {
      setRegenerating(false);
    }
  };

  const categoryHeadings = new Set(reportDoc.nodes[reportDoc.rootId]?.children.map((id) => `■${reportDoc.nodes[id]?.text}`) ?? []);

  return (
    <div className="daily-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void close(); }}>
      <section className="daily-report-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-report-title">
        <button className="lightbox-close" aria-label="閉じる" onClick={() => void close()}>×</button>
        <h2 id="daily-report-title">日報</h2>
        <p className="daily-report-map-title">{doc.title}</p>
        <label className="daily-report-label" htmlFor="daily-report-text">生成した文章は自由に編集できます。</label>
        <div className="daily-report-content">
            <textarea id="daily-report-text" value={value} onChange={(event) => updateValue(event.target.value)} />
          <div className="daily-report-preview" aria-label="日報プレビュー">
            {value.split('\n').map((line, index) => categoryHeadings.has(line)
              ? <strong key={index}>{line}</strong>
              : <span key={index}>{line || '\u00a0'}</span>)}
          </div>
        </div>
        <div className="daily-report-footer">
          <span aria-live="polite">{saveError ? '保存に失敗しました' : value === savedValue ? '保存済み' : '保存中…'}</span>
          <div>
            <button className="btn" onClick={() => void regenerate()} disabled={regenerating}>再生成</button>
            <button className="btn" onClick={() => void save(value)}>保存</button>
            <button className="btn btn-primary" onClick={() => void copy()}>{copied ? 'コピーしました' : '全文をコピー'}</button>
          </div>
        </div>
        {saveError && <p className="daily-report-error" role="alert">保存できませんでした。もう一度保存してください。</p>}
      </section>
    </div>
  );
}
