import { describe, expect, it } from 'vitest';
import { topicBackgroundClass } from './topicStyles';

describe('topic background class', () => {
  it('maps a stored background color to an outer node style class independent of selection', () => {
    expect(topicBackgroundClass('pink')).toBe('task-bg-pink');
    expect(topicBackgroundClass(undefined)).toBeUndefined();
  });
});
