import type { MindMapDoc } from '../../model/types';
import { mapRepository } from '../../db/mapRepository';

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });

/** Opens a print-ready, self-contained A4 landscape map. The browser's Save as PDF stays server-free. */
export async function printMap(doc: MindMapDoc): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) { alert('PDF出力にはポップアップを許可してください。'); return; }
  const accents: Record<string, string> = { 'calm-blue': '#607dba', natural: '#56836a', elegant: '#796485', fresh: '#31a58c', monochrome: '#555b63' };
  const textColors: Record<string, string> = { black: '#222', red: '#e03131', blue: '#1c64d6', orange: '#e8590c' };
  const render = async (id: string, depth: number): Promise<string> => {
    const node = doc.nodes[id];
    const images = await Promise.all((node.images ?? []).map(async (assetId) => { const blob = await mapRepository.getImage(assetId); return blob ? `<img src="${await toDataUrl(blob)}">` : ''; }));
    const status = node.checked ? '完了' : node.status === 'doing' ? '進行中' : node.status === 'waiting' ? '待ち' : '未着手';
    const details = [status, node.dueDate ? `期限: ${escapeHtml(node.dueDate)}` : '', node.link ? `<a href="${escapeHtml(node.link)}">${escapeHtml(node.link)}</a>` : '', node.note ? escapeHtml(node.note) : ''].filter(Boolean).join(' · ');
    const children = await Promise.all(node.children.map((child) => render(child, depth + 1)));
    return `<li><article style="--depth:${depth}"><strong style="font-weight:${node.bold ? 700 : 500};color:${textColors[node.textColor ?? 'black']}">${escapeHtml(node.text)}</strong>${node.routine ? '<em>Routine</em>' : ''}${details ? `<small>${details}</small>` : ''}<div class="images">${images.join('')}</div></article>${children.length ? `<ul>${children.join('')}</ul>` : ''}</li>`;
  };
  try {
    const tree = await render(doc.rootId, 0);
    const accent = accents[doc.colorTheme ?? 'calm-blue'];
    const radius = doc.designPreset === 'clean-structured' ? '4px' : '10px';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px system-ui;color:#28313e}h1{font-size:20px;color:${accent};border-bottom:2px solid ${accent};padding:0 0 6px}ul{list-style:none;margin:5px 0 4px 16px;padding:0 0 0 12px;border-left:1px solid ${accent}66}li{margin:5px 0}article{background:#f6f8fb;border:1px solid #dce3ed;border-radius:${radius};padding:6px 9px;break-inside:avoid}small{display:block;color:#606b78;margin-top:3px}a{color:${accent};word-break:break-all}.images img{max-width:120px;max-height:80px;margin:4px 5px 0 0}em{font-size:9px;color:${accent};margin-left:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><h1>${escapeHtml(doc.title)}</h1><ul>${tree}</ul><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
  } catch (error) { win.close(); console.error('PDF export failed', error); alert('PDF出力を準備できませんでした。'); }
}
