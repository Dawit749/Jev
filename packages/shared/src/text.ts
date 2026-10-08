export function truncateText(value: string, max: number): { text: string; truncated: boolean } {
  if (max <= 0) {
    return { text: "", truncated: value.length > 0 };
  }
  if (value.length <= max) {
    return { text: value, truncated: false };
  }
  const marker = "\n[truncated]";
  if (max <= marker.length) {
    return { text: value.slice(0, max), truncated: true };
  }
  return { text: value.slice(0, max - marker.length) + marker, truncated: true };
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
