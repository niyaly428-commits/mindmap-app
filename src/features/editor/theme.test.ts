import { describe, expect, it } from 'vitest';
import type { ColorTheme } from '../../model/types';
import { branchColor } from './theme';

describe('branchColor', () => {
  it('uses a theme-specific root color while keeping branch colors theme-specific', () => {
    const themes: ColorTheme[] = ['calm-blue', 'natural', 'elegant', 'fresh', 'monochrome'];
    const rootColors = themes.map((theme) => branchColor(-1, theme));

    expect(new Set(rootColors).size).toBe(themes.length);
    expect(themes.map((theme) => branchColor(0, theme))).not.toEqual(rootColors);
  });
});
