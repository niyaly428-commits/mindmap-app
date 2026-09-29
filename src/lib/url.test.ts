import { describe, expect, it } from 'vitest';
import { normalizeUrl, splitUrls } from './url';

describe('normalizeUrl', () => {
  it('accepts http(s) and adds https:// when missing', () => {
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl(' example.com/path ')).toBe('https://example.com/path');
  });
  it('rejects non-web or invalid URLs', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('file:///c:/x')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});

describe('splitUrls', () => {
  it('extracts URLs from memo text', () => {
    expect(splitUrls('確認: https://docs.google.com/x?id=1 です')).toEqual([
      { type: 'text', value: '確認: ' },
      { type: 'url', value: 'https://docs.google.com/x?id=1' },
      { type: 'text', value: ' です' },
    ]);
    expect(splitUrls('なし')).toEqual([{ type: 'text', value: 'なし' }]);
  });
});
