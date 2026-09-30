import type { NodeBox, Size } from '../../model/layout';
import { defaultMeasurer, layoutMap } from '../../model/layout';
import { descendantIds } from '../../model/tree';
import type { MindMapDoc, NodeId } from '../../model/types';
import { mapRepository } from '../../db/mapRepository';
import { branchColor } from './theme';

let renderedLayout: { mapId: string; boxes: NodeBox[] } | null = null;
export function publishCurrentLayout(mapId: string, boxes: NodeBox[]) { renderedLayout = { mapId, boxes }; }

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });

interface CanvasBox extends NodeBox { width: number; height: number }
interface PrintPage { title: string; ids: NodeId[]; boxes: Map<NodeId, CanvasBox> }

const wrapLines = (text: string, chars: number) => text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0);

function pageMarkup(doc: MindMapDoc, title: string, boxes: Map<NodeId, CanvasBox>, allIds: NodeId[], assets: Map<string, string>, pageIndex: number) {
  const nodes = allIds.map((id) => boxes.get(id)!).filter(Boolean);
  const minX = Math.min(...nodes.map((b) => b.x));
  const minY = Math.min(...nodes.map((b) => b.y));
  const maxX = Math.max(...nodes.map((b) => b.x + b.width));
  const maxY = Math.max(...nodes.map((b) => b.y + b.height));
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const pageWidth = 1066, pageHeight = 684;
  const scale = Math.min(1.45, pageWidth / w, pageHeight / h);
  const contentW = w * scale, contentH = h * scale;
  const ox = (pageWidth - contentW) / 2, oy = (pageHeight - contentH) / 2;
  const xy = (b: CanvasBox) => ({ x: ox + (b.x - minX) * scale, y: oy + (b.y - minY) * scale, width: b.width * scale, height: b.height * scale });
  const idSet = new Set(allIds);
  const paths = nodes.filter((b) => doc.nodes[b.id].parentId && idSet.has(doc.nodes[b.id].parentId!)).map((child) => {
    const parent = boxes.get(doc.nodes[child.id].parentId!)!;
    const p = xy(parent), c = xy(child), toRight = c.x + c.width / 2 >= p.x + p.width / 2;
    const x1 = toRight ? p.x + p.width : p.x, x2 = toRight ? c.x : c.x + c.width;
    const y2 = c.y + c.height / 2;
    const y1 = p.y + p.height / 2;
    const siblings = doc.nodes[parent.id].children.filter((id) => idSet.has(id) && boxes.get(id)?.side === child.side);
    const siblingIndex = siblings.indexOf(child.id);
    const siblingCenters = siblings.map((id) => { const sibling = xy(boxes.get(id)!); return sibling.y + sibling.height / 2; });
    const routeLane = 28 * scale;
    const direction = x2 >= x1 ? 1 : -1;
    const d = doc.designPreset === 'soft-organic' || !doc.designPreset
      ? `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`
      : siblings.length < 2
        ? `M ${x1} ${y1} H ${x1 + direction * routeLane} V ${y2} H ${x2}`
        : siblingIndex === 0
          ? `M ${x1} ${y1} H ${x1 + direction * routeLane} V ${Math.min(...siblingCenters)} V ${Math.max(...siblingCenters)} M ${x1 + direction * routeLane} ${y2} H ${x2}`
          : `M ${x1 + direction * routeLane} ${y2} H ${x2}`;
    return `<path d="${d}" fill="none" stroke="${branchColor(child.branch, doc.colorTheme)}" stroke-width="${doc.designPreset === 'soft-organic' ? 2.3 : doc.designPreset === 'clean-structured' ? 1.5 : 1.15}" stroke-linecap="${doc.designPreset === 'clean-structured' ? 'square' : 'round'}"/>`;
  }).join('');
  const cards = nodes.map((box) => {
    const n = doc.nodes[box.id], pos = xy(box);
    const status = n.checked ? 'Done' : n.status === 'doing' ? 'In progress' : n.status === 'waiting' ? 'Waiting' : 'To do';
    const statusKey = n.checked ? 'done' : n.status ?? 'todo';
    const metadata = [n.dueDate ? `Due ${esc(n.dueDate)}` : '', n.routine ? 'Routine' : ''].filter(Boolean).map((x) => `<span class="meta-pill">${x}</span>`).join('');
    const note = n.note ? `<div class="node-note">${esc(n.note)}</div>` : '';
    const link = n.link ? `<a class="node-link" href="${esc(n.link)}">${esc(n.link)}</a>` : '';
    const images = (n.images ?? []).map((assetId) => assets.get(assetId)).filter(Boolean).map((src) => `<img src="${src}" alt="Attached image">`).join('');
    return `<article class="mindmap-node depth-${box.depth}" data-node-id="${esc(box.id)}" style="left:${pos.x}px;top:${pos.y}px;width:${pos.width}px;min-height:${pos.height}px;--scale:${scale};--branch:${branchColor(box.branch, doc.colorTheme)};--title-color:${n.textColor === 'red' ? '#e03131' : n.textColor === 'blue' ? '#1c64d6' : n.textColor === 'orange' ? '#e8590c' : '#253248'};--bold:${n.bold ? 750 : 550}"><div class="node-heading"><span class="status status-${statusKey}">${status}</span><strong>${esc(n.text)}</strong>${metadata}</div>${link}${note}${images ? `<div class="node-images">${images}</div>` : ''}</article>`;
  }).join('');
  return `<section class="mindmap-sheet" data-page="${pageIndex}"><header><div><small>${pageIndex === 1 ? 'MIND MAP' : 'BRANCH DETAIL'}</small><h1>${esc(doc.title)}</h1></div><span>${esc(title)}</span></header><div class="mindmap-canvas"><svg class="mindmap-connectors" width="1066" height="684" viewBox="0 0 1066 684" aria-hidden="true">${paths}</svg>${cards}</div><footer>${pageIndex} · ${esc(doc.designPreset ?? 'soft-organic')} · ${esc(doc.colorTheme ?? 'calm-blue')}</footer></section>`;
}

function buildPrintPages(doc: MindMapDoc, screenBoxes: NodeBox[]): PrintPage[] {
  const screen = new Map(screenBoxes.map((box) => [box.id, box]));
  const sizes = new Map<NodeId, Size>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    const box = screen.get(id);
    const depth = box?.depth ?? 2;
    const width = box?.width ?? (depth === 0 ? 210 : depth === 1 ? 150 : 130);
    const noteLines = node.note ? wrapLines(node.note, Math.max(18, Math.floor((width - 24) / 7))) : 0;
    const linkLines = node.link ? wrapLines(node.link, Math.max(18, Math.floor((width - 24) / 7))) : 0;
    const imageRows = Math.ceil((node.images?.length ?? 0) / 2);
    const extra = (node.note ? 6 + noteLines * 11 : 0) + (node.link ? 4 + linkLines * 11 : 0) + imageRows * 21;
    sizes.set(id, { width, height: (box?.height ?? 40) + extra });
  }
  const expandedDoc: MindMapDoc = { ...doc, nodes: Object.fromEntries(Object.entries(doc.nodes).map(([id, node]) => [id, { ...node, collapsed: false }])) };
  const arranged = layoutMap(expandedDoc, defaultMeasurer, sizes, doc.designPreset);
  const boxes = new Map(Array.from(arranged, ([id, box]) => [id, { ...box, width: sizes.get(id)!.width, height: sizes.get(id)!.height }]));
  const allIds = Array.from(boxes.keys());
  const full = { title: doc.title, boxes, ids: allIds };
  const getScale = (ids: NodeId[]) => {
    const group = ids.map((id) => boxes.get(id)!).filter(Boolean);
    const width = Math.max(...group.map((b) => b.x + b.width)) - Math.min(...group.map((b) => b.x));
    const height = Math.max(...group.map((b) => b.y + b.height)) - Math.min(...group.map((b) => b.y));
    return Math.min(1, 1066 / width, 684 / height);
  };
  const pages: PrintPage[] = [full];
  if (getScale(allIds) < 0.78) {
    const branches = doc.nodes[doc.rootId].children;
    for (let offset = 0; offset < branches.length; offset += 4) {
      const group = branches.slice(offset, offset + 4);
      const detailRoot = { ...expandedDoc.nodes[doc.rootId], children: group };
      const detailDoc: MindMapDoc = { ...expandedDoc, nodes: { ...expandedDoc.nodes, [doc.rootId]: detailRoot } };
      const rawDetailBoxes = layoutMap(detailDoc, defaultMeasurer, sizes, doc.designPreset);
      const detailBoxes = new Map(Array.from(rawDetailBoxes, ([id, box]) => [id, { ...box, width: sizes.get(id)!.width, height: sizes.get(id)!.height, branch: boxes.get(id)?.branch ?? box.branch }]));
      const ids = [doc.rootId, ...group.flatMap((id) => [id, ...descendantIds(doc.nodes, id)])].filter((id) => detailBoxes.has(id));
      if (ids.length > 1) pages.push({ title: group.map((id) => doc.nodes[id].text).join(' · '), ids, boxes: detailBoxes });
    }
  }
  return pages;
}

/** Builds a spatial, connector-based A4 landscape map. Oversized maps receive branch detail sheets. */
export async function printMap(doc: MindMapDoc): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) { alert('PDF output requires popups to be allowed.'); return; }
  try {
    const sourceBoxes = renderedLayout?.mapId === doc.id ? renderedLayout.boxes : [];
    const pages = buildPrintPages(doc, sourceBoxes);
    const ids = new Set(pages.flatMap((p) => p.ids));
    const assets = new Map<string, string>();
    for (const node of Object.values(doc.nodes)) for (const assetId of node.images ?? []) {
      if (!ids.has(node.id) || assets.has(assetId)) continue;
      const blob = await mapRepository.getImage(assetId);
      if (blob) assets.set(assetId, await dataUrl(blob));
    }
    const body = pages.map((page, index) => pageMarkup(doc, page.title, page.boxes, page.ids, assets, index + 1)).join('');
    const accent = branchColor(0, doc.colorTheme);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
      @page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:system-ui,-apple-system,"Yu Gothic UI",sans-serif;color:#26354a;background:#fff}
      .mindmap-sheet{position:relative;width:1122px;height:794px;padding:20px 28px;overflow:hidden;page-break-after:always;break-after:page;background:${doc.designPreset === 'soft-organic' ? '#fbf9f4' : doc.designPreset === 'clean-structured' ? '#f6f8fb' : '#f4f6fb'}}
      .mindmap-sheet:last-child{page-break-after:auto;break-after:auto}header{height:58px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe3ef;margin-bottom:10px}header small{display:block;font-size:8px;letter-spacing:2px;color:${accent};font-weight:700}h1{font-size:17px;margin:2px 0 7px;color:#273c58}header>span{font-size:13px;color:#5e6d80;font-weight:600}.mindmap-canvas{position:relative;width:1066px;height:684px;overflow:hidden}.mindmap-connectors{position:absolute;inset:0;overflow:visible}.mindmap-node{position:absolute;z-index:1;display:flex;flex-direction:column;gap:calc(3px * var(--scale));padding:calc(5px * var(--scale)) calc(8px * var(--scale));border:1px solid color-mix(in srgb,var(--branch) 22%,#fff);background:color-mix(in srgb,var(--branch) 9%,#fff);border-radius:${doc.designPreset === 'clean-structured' ? '5px' : doc.designPreset === 'soft-organic' ? '17px' : '12px'};box-shadow:${doc.designPreset === 'soft-analytical' ? '0 2px 8px #34466012' : 'none'};font-size:calc(10px * var(--scale));line-height:1.25;overflow:visible}.node-heading{display:flex;align-items:center;gap:calc(4px * var(--scale));min-width:0}.node-heading strong{font-size:calc(11px * var(--scale));color:var(--title-color);font-weight:var(--bold);overflow-wrap:anywhere}.depth-0{color:#fff;background:${doc.designPreset === 'soft-organic' ? '#dceafe' : '#344c6b'};border-color:${doc.designPreset === 'soft-organic' ? '#b8d0f5' : '#344c6b'};border-radius:${doc.designPreset === 'clean-structured' ? '7px' : '18px'};box-shadow:0 3px 12px #263b5818}.depth-0 .node-heading strong{color:${doc.designPreset === 'soft-organic' ? '#263f67' : '#fff'};font-size:calc(13px * var(--scale))}.depth-1{background:${doc.designPreset === 'soft-organic' ? 'var(--branch)' : 'color-mix(in srgb,var(--branch) 15%,#fff)'};border-radius:${doc.designPreset === 'clean-structured' ? '4px' : '15px'}}.depth-1 .node-heading strong{color:${doc.designPreset === 'soft-organic' ? '#fff' : '#2b3d54'}}.depth-2{background:${doc.designPreset === 'clean-structured' ? '#edf1f6' : '#fff'}}.status{flex:none;border-radius:10px;padding:calc(2px * var(--scale)) calc(4px * var(--scale));font-size:calc(7px * var(--scale));background:#fff;color:#5b6878}.status-doing{color:#1768ac}.status-waiting{color:#b86a00}.status-done{color:#25834f}.meta-pill{flex:none;border-radius:8px;padding:calc(2px * var(--scale)) calc(4px * var(--scale));background:#ffffffc9;color:#596b80;font-size:calc(7px * var(--scale))}.node-link{display:block;color:${accent};font-size:calc(8px * var(--scale));overflow-wrap:anywhere}.node-note{white-space:pre-wrap;overflow-wrap:anywhere;color:#59677a;font-size:calc(8px * var(--scale))}.node-images{display:flex;flex-wrap:wrap;gap:calc(3px * var(--scale))}.node-images img{width:calc(48px * var(--scale));height:calc(48px * var(--scale));object-fit:contain;background:#fff;border-radius:5px}footer{position:absolute;bottom:8px;right:28px;color:#8a95a4;font-size:8px}
      .save-pdf{position:fixed;z-index:10;right:18px;top:14px;border:0;border-radius:6px;padding:10px 16px;background:#315f9d;color:white;font:600 14px system-ui;cursor:pointer;box-shadow:0 2px 8px #263b5833}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.save-pdf{display:none}}
      </style></head><body><button class="save-pdf" onclick="window.print()">PDFとして保存</button>${body}</body></html>`);
    win.document.close();
  } catch (error) { win.close(); console.error('PDF export failed', error); alert('PDF export could not be prepared.'); }
}
