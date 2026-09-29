import { createId, createMap } from './tree';
import type { MindMapDoc, MindNode, NodeId } from './types';

/** Formats month/day, zero-padded only if the original used zero padding (e.g. "09"). */
const md = (m: number, d: number, origM: string, origD: string, alwaysPad = false) => {
  const padded = alwaysPad || origM.startsWith('0') || origD.startsWith('0');
  const f = (n: number) => (padded ? String(n).padStart(2, '0') : String(n));
  return [f(m), f(d)];
};

const isValid = (y: number, m: number, d: number) => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

const addDay = (y: number, m: number, d: number) => {
  const next = new Date(y, m - 1, d + 1);
  return { y: next.getFullYear(), m: next.getMonth() + 1, d: next.getDate() };
};

/**
 * Finds a date in the title and replaces it with the next day, keeping the original format
 * (e.g. "タスク_9月29日" -> "タスク_9月30日", "2026/09/29" -> "2026/09/30").
 * Titles without a date get "タスク_M月D日" of the day after `fallback`.
 */
export function nextDayTitle(title: string, fallback: Date): string {
  const baseYear = fallback.getFullYear();

  // YYYY年M月D日
  let m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(title);
  if (m && isValid(+m[1], +m[2], +m[3])) {
    const n = addDay(+m[1], +m[2], +m[3]);
    const [mm, dd] = md(n.m, n.d, m[2], m[3]);
    return title.replace(m[0], `${n.y}年${mm}月${dd}日`);
  }
  // YYYY/M/D, YYYY-MM-DD, YYYY.M.D
  m = /(\d{4})([/.-])(\d{1,2})\2(\d{1,2})(?!\d)/.exec(title);
  if (m && isValid(+m[1], +m[3], +m[4])) {
    const n = addDay(+m[1], +m[3], +m[4]);
    const [mm, dd] = md(n.m, n.d, m[3], m[4], m[2] === '-');
    return title.replace(m[0], `${n.y}${m[2]}${mm}${m[2]}${dd}`);
  }
  // M月D日
  m = /(\d{1,2})月(\d{1,2})日/.exec(title);
  if (m && isValid(baseYear, +m[1], +m[2])) {
    const n = addDay(baseYear, +m[1], +m[2]);
    const [mm, dd] = md(n.m, n.d, m[1], m[2]);
    return title.replace(m[0], `${mm}月${dd}日`);
  }
  // M/D
  m = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(title);
  if (m && isValid(baseYear, +m[1], +m[2])) {
    const n = addDay(baseYear, +m[1], +m[2]);
    const [mm, dd] = md(n.m, n.d, m[1], m[2]);
    return title.replace(m[0], `${mm}/${dd}`);
  }
  const n = addDay(baseYear, fallback.getMonth() + 1, fallback.getDate());
  return `タスク_${n.m}月${n.d}日`;
}

function copySubtree(src: Record<NodeId, MindNode>, id: NodeId, parentId: NodeId, out: Record<NodeId, MindNode>) {
  const newId = createId();
  const children = src[id].children.map((c) => copySubtree(src, c, newId, out));
  out[newId] = { ...src[id], id: newId, parentId, children };
  return newId;
}

/**
 * Creates the next day's map. The source map is not modified.
 * Unchecked main topics (root children) are carried over with their whole subtree
 * (including children's checked state, status, memo and link); checked main topics are dropped.
 */
export function createNextDayMap(source: MindMapDoc, now = Date.now()): MindMapDoc {
  const doc = createMap(nextDayTitle(source.title, new Date(source.createdAt)), now);
  const nodes = { ...doc.nodes };
  const carried = source.nodes[source.rootId].children
    .filter((id) => !source.nodes[id].checked)
    .map((id) => copySubtree(source.nodes, id, doc.rootId, nodes));
  nodes[doc.rootId] = { ...nodes[doc.rootId], children: carried };
  return { ...doc, nodes };
}
