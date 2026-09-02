export type EntryColor = 'blue' | 'yellow' | 'red';

export type TimelineEntry = {
  id: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  color: EntryColor;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export const GUEST_STORAGE_KEY = 'daymark.entries.v1';
export const DURATION_STORAGE_KEY = 'daymark.duration.v1';
export const TIMELINE_ROW_HEIGHT = 60;

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function shiftDate(key: string, amount: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function formatDay(key: string, compact = false) {
  if (!key) return 'Today';
  return new Intl.DateTimeFormat(
    'en-US',
    compact
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { weekday: 'long', month: 'long', day: 'numeric' },
  ).format(dateFromKey(key));
}

export function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function snapMinute(value: number, interval = 5) {
  return Math.max(
    0,
    Math.min(24 * 60, Math.round(value / interval) * interval),
  );
}

export function minuteToInput(value: number) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, value));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function inputToMinute(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTime(value: number) {
  const safe = Math.max(0, Math.min(24 * 60, value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (safe === 24 * 60) return '12:00 AM';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatHour(hour: number) {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour > 12 ? hour - 12 : hour} ${hour > 12 ? 'PM' : 'AM'}`;
}

export function formatDuration(minutes: number) {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function entryColor(seed: string): EntryColor {
  const colors: EntryColor[] = ['blue', 'yellow', 'red'];
  const hash = Array.from(seed).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return colors[hash % colors.length];
}

export function loadGuestEntries(): TimelineEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(GUEST_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed) ? parsed.filter(isTimelineEntry) : [];
  } catch {
    return [];
  }
}

export function saveGuestEntries(entries: TimelineEntry[]) {
  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(entries));
}

export function isTimelineEntry(value: unknown): value is TimelineEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TimelineEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.startMinute === 'number' &&
    typeof entry.endMinute === 'number' &&
    entry.endMinute > entry.startMinute
  );
}

export function overlaps(
  entries: TimelineEntry[],
  startMinute: number,
  endMinute: number,
  ignoreId?: string,
) {
  return entries.some(
    (entry) =>
      entry.id !== ignoreId &&
      !entry.deletedAt &&
      startMinute < entry.endMinute &&
      endMinute > entry.startMinute,
  );
}
