import type { TaskBackgroundColor } from '../../model/types';

/** Persistent background styles belong to the node container, independent of selection classes. */
export const topicBackgroundClass = (color?: TaskBackgroundColor): string | undefined =>
  color ? `task-bg-${color}` : undefined;
