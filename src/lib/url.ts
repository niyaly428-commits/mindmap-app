/** Returns a normalized http(s) URL, or null if the input is not a valid web URL. Adds https:// if missing. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

export type TextPart = { type: 'text'; value: string } | { type: 'url'; value: string };

const URL_RE = /https?:\/\/[^\s<>"'「」、。）)]+/g;

/** Splits text into plain parts and http(s) URL parts (for rendering links in memos). */
export function splitUrls(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'url', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
