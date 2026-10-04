const PALETTES: Record<string, string[]> = {
  'calm-blue': ['#4e7ac7', '#8fb3e8', '#628bcf', '#2e3a59', '#a9c5ed'],
  natural: ['#7e9e7a', '#b7d1b0', '#588b67', '#44594a', '#a3b18a'],
  elegant: ['#8f7bb7', '#b8a9d6', '#7866a5', '#3f3a5b', '#c7b9df'],
  fresh: ['#52c2b9', '#8ebdd6', '#289d93', '#3d829a', '#a1ddd7'],
  monochrome: ['#647488', '#aab4c2', '#46566d', '#1f2937', '#cbd5e1'],
};

export const branchColor = (branch: number, theme = 'calm-blue'): string => {
  const palette = PALETTES[theme] ?? PALETTES['calm-blue'];
  // Keep the root visually distinct while sourcing its color from the active theme.
  return branch < 0 ? palette[3] : palette[branch % palette.length];
};
