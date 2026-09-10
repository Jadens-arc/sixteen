const DEFAULT_TIMEZONE = "America/New_York";

function appTimezone(): string {
  return process.env.APP_TIMEZONE ?? DEFAULT_TIMEZONE;
}

export function todayInAppTimezone(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + delta));
  return utcDate.toISOString().slice(0, 10);
}

export function formatPromptDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(utcDate);
}

// Notebook verses are stamped with a moment rather than issued for a day, so
// they are read back in the app's timezone - the same clock that decides which
// day a prompt belongs to.
export function formatWrittenAt(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimezone(),
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

// A prompt date arrives from the URL on the archive detail route, where it is
// used to look a row up. Checking the shape *and* that the parts survive a
// round trip rejects both "yesterday" and "2026-02-31" before either reaches
// the database, where an invalid date is an error rather than a miss.
export function isPromptDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return utcDate.toISOString().slice(0, 10) === value;
}
