const PALETTES: Record<string, string[]> = {
  'calm-blue': ['#e8615d', '#f0913f', '#3fb1a7', '#5b8def', '#9b6ddb', '#e05f9f', '#5fae5b'],
  natural: ['#52796f', '#84a98c', '#a3b18a', '#bc6c25', '#6b705c', '#588157'],
  elegant: ['#8c6a91', '#b784a7', '#627d98', '#a26769', '#8b7d6b', '#52616b'],
  fresh: ['#21a179', '#2d9cdb', '#8abf4b', '#ed9b40', '#e56b6f', '#8574c9'],
  monochrome: ['#434a54', '#666f7a', '#808891', '#9aa1a8', '#565d66', '#737b84'],
};

export const ROOT_COLOR = '#2f3441';

export const branchColor = (branch: number, theme = 'calm-blue'): string =>
  branch < 0 ? ROOT_COLOR : (PALETTES[theme] ?? PALETTES['calm-blue'])[branch % (PALETTES[theme] ?? PALETTES['calm-blue']).length];
