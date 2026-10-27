import { useCallback, useEffect, useRef, useState } from 'react';
import { mapRepository } from '../../db/mapRepository';
import { generateDailyReport, listDailyReportMemos, resolveDailyReportDraft } from '../../model/dailyReport';
import type { MindMapDoc } from '../../model/types';
import { useEditorStore } from '../../store/editorStore';

export function DailyReportDialog({ doc, onClose }: { doc: MindMapDoc; onClose: () => void }) {
  const initialMemos = listDailyReportMemos(doc);
  const memoIds = new Set(initialMemos.map((memo) => memo.nodeId));
  const initialExcluded = (doc.dailyReportExcludedMemoIds ?? []).filter((id) => memoIds.has(id));
  const initialOptions = { excludedMemoIds: initialExcluded };
  const initial = resolveDailyReportDraft(doc, doc.dailyReport, initialOptions);
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const generatedValueRef = useRef(generateDailyReport(doc, initialOptions));
  const [reportDoc, setReportDoc] = useState(doc);
  const [excludedMemoIds, setExcludedMemoIds] = useState<string[]>(initialExcluded);
  const [regenerating, setRegenerating] = useState(false);
  const [savedValue, setSavedValue] = useState(initial);
  const [savedExcludedMemoIds, setSavedExcludedMemoIds] = useState(initialExcluded);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const memos = listDailyReportMemos(reportDoc);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));

  const save = useCallback((text: string, excludedIds: string[]) => {
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => mapRepository.saveDailyReport(doc.id, text, excludedIds))
      .then(() => { setSavedValue(text); setSavedExcludedMemoIds(excludedIds); setSaveError(false); return true; })
      .catch(() => { setSaveError(true); return false; });
    return saveQueue.current;
  }, [doc.id]);

  useEffect(() => {
    if (value === savedValue && sameIds(excludedMemoIds, savedExcludedMemoIds)) return;
    const timer = window.setTimeout(() => { void save(value, [...excludedMemoIds]); }, 500);
    return () => window.clearTimeout(timer);
  }, [excludedMemoIds, save, savedExcludedMemoIds, savedValue, value]);

  const close = async () => {
    if (!(await save(value, [...excludedMemoIds]))) return;
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

  const toggleMemo = (nodeId: string, include: boolean) => {
    const nextExcluded = include
      ? excludedMemoIds.filter((id) => id !== nodeId)
      : excludedMemoIds.includes(nodeId) ? excludedMemoIds : [...excludedMemoIds, nodeId];
    setExcludedMemoIds(nextExcluded);
    // Keep a clean generated draft in sync with the controls, but never replace
    // text the user has edited; edited drafts update when they choose regenerate.
    if (valueRef.current === generatedValueRef.current) {
      const generated = generateDailyReport(reportDoc, { excludedMemoIds: nextExcluded });
      generatedValueRef.current = generated;
      updateValue(generated);
    }
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
      const nextReport = generateDailyReport(latestDoc, { excludedMemoIds });
      if (valueRef.current !== generatedValueRef.current && valueRef.current !== nextReport && !window.confirm('現在の日報を生成内容で置き換えます。編集内容は失われます。続けますか？')) return;
      setReportDoc(latestDoc);
      generatedValueRef.current = nextReport;
      updateValue(nextReport);
    } finally {
      setRegenerating(false);
    }
  };

  const categoryHeadings = new Set(reportDoc.nodes[reportDoc.rootId]?.children.map((id) => `■${reportDoc.nodes[id]?.text}`) ?? []);
  const excluded = new Set(excludedMemoIds);

  return (
    <div className="daily-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void close(); }}>
      <section className="daily-report-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-report-title">
        <button className="lightbox-close" aria-label="閉じる" onClick={() => void close()}>×</button>
        <h2 id="daily-report-title">日報</h2>
        <p className="daily-report-map-title">{doc.title}</p>
        <label className="daily-report-label" htmlFor="daily-report-text">生成した文章は自由に編集できます。</label>
        <details className="daily-report-memo-settings" open>
          <summary>日報に反映するメモ（{memos.length}件）</summary>
          <p>チェックを外すと、そのノードのメモだけを日報から除外します。元のマップのメモは変更されません。</p>
          {memos.length === 0 ? <span>反映対象のメモはありません。</span> : <div className="daily-report-memo-list">
            {memos.map((memo) => <label className="daily-report-memo-option" key={memo.nodeId}>
              <input type="checkbox" checked={!excluded.has(memo.nodeId)} aria-label={`${memo.path} のメモを日報に反映`} onChange={(event) => toggleMemo(memo.nodeId, event.target.checked)} />
              <span><strong>{memo.path}</strong><pre>{memo.text}</pre></span>
            </label>)}
          </div>}
        </details>
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
            <button className="btn" onClick={() => void save(value, [...excludedMemoIds])}>保存</button>
            <button className="btn btn-primary" onClick={() => void copy()}>{copied ? 'コピーしました' : '全文をコピー'}</button>
          </div>
        </div>
        {saveError && <p className="daily-report-error" role="alert">保存できませんでした。もう一度保存してください。</p>}
      </section>
    </div>
  );
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
