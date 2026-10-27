import { afterEach, describe, expect, it, vi } from 'vitest';
import { addChild, createMap, setAttributes } from '../../model/tree';
import { printMap } from './pdfExport';

afterEach(() => vi.unstubAllGlobals());

describe('PDF export', () => {
  it('includes a stored task background color in the exported node', async () => {
    let doc = createMap('PDF highlights');
    const task = addChild(doc, doc.rootId, 'Important task');
    doc = setAttributes(task.doc, task.id, { backgroundColor: 'blue' });
    const write = vi.fn();
    vi.stubGlobal('window', { open: () => ({ document: { write, close: vi.fn() }, close: vi.fn() }) });

    await printMap(doc);

    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('background:#e2eef8;');
    expect(html).toContain('Important task');
  });
});
