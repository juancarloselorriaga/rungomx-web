/**
 * Formats a finish time from milliseconds into a human-readable string.
 * Returns h:mm:ss for races over an hour, or m:ss for shorter times.
 * Returns '-' for null or negative values.
 */
export function formatFinishTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) return '-';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
