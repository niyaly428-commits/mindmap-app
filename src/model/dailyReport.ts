import { displayStatus } from './tree';
import { mapDateOf } from './timeline';
import type { MindMapDoc, MindNode, NodeId } from './types';

type ReportStatus = 'done' | 'doing' | 'waiting';

/** Removes the old generated Markdown heading markers from saved drafts. */
export function normalizeDailyReportText(text: string): string {
  return text.replace(/^\*\*■ ?(.*?)\*\*$/gm, '■$1');
}

function reportStatus(node: MindNode): ReportStatus | undefined {
  const status = displayStatus(node);
  return status === 'done' || status === 'doing' || status === 'waiting' ? status : undefined;
}

/** A heading-led memo is a complete report section for the node's subtree. */
function hasDetailedReportMemo(node: MindNode): boolean {
  return !!node.note?.split(/\r?\n/).some((line) => /^\s*[■▽]\s*\S/.test(line));
}

function taskOwnLines(node: MindNode, depth: number): string[] {
  const eligible = !!reportStatus(node);
  const indent = '  '.repeat(depth);
  const lines = [`${indent}${eligible ? '・' : '〇'}${node.text}`];
  if (node.note) lines.push(...node.note.split(/\r?\n/).map((line) => `${indent}  ${line}`));
  if (eligible && node.link) lines.push(`${indent}  関連リンク: ${node.link}`);
  if (eligible && node.dueDate) lines.push(`${indent}  期限: ${node.dueDate}`);
  return lines;
}

/** Renders the stored node tree without interpreting note text as map structure. */
function renderTaskTree(
  nodes: Record<NodeId, MindNode>,
  id: NodeId,
  depth: number,
  visited: Set<NodeId>,
  suppressDetailedSubtree: boolean,
): string[] {
  if (visited.has(id)) return [];
  visited.add(id);
  const node = nodes[id];
  if (!node) return [];

  const eligible = !!reportStatus(node);
  const detailedMemo = hasDetailedReportMemo(node);
  const descendants = suppressDetailedSubtree && detailedMemo
    ? []
    : node.children.flatMap((child) => renderTaskTree(nodes, child, depth + 1, visited, suppressDetailedSubtree));
  if (!eligible && !descendants.length && !(suppressDetailedSubtree && detailedMemo)) return [];

  const lines = taskOwnLines(node, depth);
  lines.push(...descendants);
  return lines;
}

function removeExactBlockAfter(
  lines: string[], anchor: string[], duplicateBlock: string[], rangeStart: number, rangeEnd: number,
): number {
  if (!anchor.length || !duplicateBlock.length) return 0;
  for (let start = rangeStart; start + anchor.length + duplicateBlock.length <= rangeEnd; start += 1) {
    if (!anchor.every((line, offset) => lines[start + offset] === line)) continue;
    const blockStart = start + anchor.length;
    if (!duplicateBlock.every((line, offset) => lines[blockStart + offset] === line)) continue;
    lines.splice(blockStart, duplicateBlock.length);
    return duplicateBlock.length;
  }
  return 0;
}

function collectPossibleTaskLines(nodes: Record<NodeId, MindNode>, ids: NodeId[], depth: number): Set<string> {
  const result = new Set<string>();
  const visit = (id: NodeId, currentDepth: number): void => {
    const node = nodes[id];
    if (!node) return;
    const indent = '  '.repeat(currentDepth);
    result.add(`${indent}・${node.text}`);
    result.add(`${indent}〇${node.text}`);
    if (node.note) for (const line of node.note.split(/\r?\n/)) result.add(`${indent}  ${line}`);
    if (node.link) result.add(`${indent}  関連リンク: ${node.link}`);
    if (node.dueDate) result.add(`${indent}  期限: ${node.dueDate}`);
    node.children.forEach((child) => visit(child, currentDepth + 1));
  };
  ids.forEach((id) => visit(id, depth));
  return result;
}

function reportTaskDepth(line: string): number | undefined {
  const match = line.match(/^( *)(?:・|〇)/);
  return match && match[1].length % 2 === 0 ? match[1].length / 2 : undefined;
}

/** Removes stale descendant rows even when their saved status markers are old. */
function removeStaleDescendantLines(
  lines: string[], nodes: Record<NodeId, MindNode>, anchor: string[], descendantIds: NodeId[], descendantDepth: number,
  rangeStart: number, rangeEnd: number, parentDepth?: number,
): number {
  const anchorStart = lines.findIndex((_, index) =>
    index >= rangeStart && index + anchor.length <= rangeEnd && anchor.every((part, offset) => lines[index + offset] === part));
  if (anchorStart < 0) return 0;

  const blockStart = anchorStart + anchor.length;
  let blockEnd = rangeEnd;
  if (parentDepth !== undefined) {
    for (let index = blockStart; index < blockEnd; index += 1) {
      const depth = reportTaskDepth(lines[index]);
      if (depth !== undefined && depth <= parentDepth) { blockEnd = index; break; }
    }
  }

  const possibleLines = collectPossibleTaskLines(nodes, descendantIds, descendantDepth);
  let removed = 0;
  for (let index = blockStart; index < blockEnd;) {
    if (possibleLines.has(lines[index])) {
      lines.splice(index, 1);
      blockEnd -= 1;
      rangeEnd -= 1;
      removed += 1;
    } else index += 1;
  }
  return removed;
}

/** Removes duplicate descendant rows only for nodes with a detailed report memo. */
function removeDetailedMemoDuplicates(doc: MindMapDoc, draft: string): string {
  const lines = draft.split('\n');
  const root = doc.nodes[doc.rootId];
  if (!root) return draft;

  for (const categoryId of root.children) {
    const category = doc.nodes[categoryId];
    if (!category) continue;
    const heading = `■${category.text}`;
    const start = lines.findIndex((line) => line === heading);
    if (start < 0) continue;
    let end = lines.findIndex((line, index) => index > start && (line.startsWith('■') || line === '以上です。'));
    if (end < 0) end = lines.length;

    if (hasDetailedReportMemo(category)) {
      const anchor = [heading, ...(category.note ?? '').split(/\r?\n/).map((line) => `  ${line}`)];
      const duplicateBlock = category.children.flatMap((id) => renderTaskTree(doc.nodes, id, 0, new Set(), false));
      end -= removeExactBlockAfter(lines, anchor, duplicateBlock, start, end);
      end -= removeStaleDescendantLines(lines, doc.nodes, anchor, category.children, 0, start, end);
      continue;
    }

    const visit = (id: NodeId, depth: number): void => {
      const node = doc.nodes[id];
      if (!node) return;
      if (hasDetailedReportMemo(node)) {
        const anchor = taskOwnLines(node, depth);
        const duplicateBlock = node.children.flatMap((child) => renderTaskTree(doc.nodes, child, depth + 1, new Set(), false));
        end -= removeExactBlockAfter(lines, anchor, duplicateBlock, start + 1, end);
        end -= removeStaleDescendantLines(lines, doc.nodes, anchor, node.children, depth + 1, start + 1, end, depth);
        return;
      }
      node.children.forEach((child) => visit(child, depth + 1));
    };
    category.children.forEach((id) => visit(id, 0));
  }
  return lines.join('\n');
}

function generateDailyReportVersion(doc: MindMapDoc, suppressDetailedSubtree: boolean): string {
  const [, month, day] = mapDateOf(doc).split('-').map(Number);
  const lines = ['お疲れ様です、田坂です。', '本日の業務報告です。', '', `${month}月${day}日 業務日報`];
  const root = doc.nodes[doc.rootId];
  if (root) {
    for (const categoryId of root.children) {
      const category = doc.nodes[categoryId];
      if (!category) continue;
      const detailedMemo = hasDetailedReportMemo(category);
      const visited = new Set<NodeId>();
      const tasks = suppressDetailedSubtree && detailedMemo
        ? []
        : category.children.flatMap((id) => renderTaskTree(doc.nodes, id, 0, visited, suppressDetailedSubtree));
      if (!tasks.length && !(suppressDetailedSubtree && detailedMemo)) continue;
      lines.push('', `■${category.text}`);
      if (category.note) lines.push(...category.note.split(/\r?\n/).map((line) => `  ${line}`));
      lines.push(...tasks);
    }
  }
  lines.push('', '以上です。', '本日もありがとうございました。', '明日もどうぞよろしくお願いいたします。', '', '田坂');
  return lines.join('\n');
}

export function generateDailyReport(doc: MindMapDoc): string {
  return generateDailyReportVersion(doc, true);
}

/** Keeps user-edited drafts and removes only stale duplicate rows beneath detailed memos. */
export function resolveDailyReportDraft(doc: MindMapDoc, savedDraft?: string): string {
  const generated = generateDailyReport(doc);
  if (savedDraft === undefined) return generated;
  const normalizedDraft = normalizeDailyReportText(savedDraft);
  if (normalizedDraft === generateDailyReportVersion(doc, false)) return generated;
  return removeDetailedMemoDuplicates(doc, normalizedDraft);
}
