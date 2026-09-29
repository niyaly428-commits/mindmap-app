export const BRANCH_COLORS = ['#e8615d', '#f0913f', '#3fb1a7', '#5b8def', '#9b6ddb', '#e05f9f', '#5fae5b'];

export const ROOT_COLOR = '#2f3441';

export const branchColor = (branch: number): string =>
  branch < 0 ? ROOT_COLOR : BRANCH_COLORS[branch % BRANCH_COLORS.length];
