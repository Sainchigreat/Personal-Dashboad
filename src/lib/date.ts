export function todayInZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (key: string) =>
    parts.find((item) => item.type === key)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const weekday = date.getUTCDay();
  return addDays(value, -(weekday === 0 ? 6 : weekday - 1));
}
export function displayDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}
export function displayMonth(value: string): string {
  return displayDate(`${value}-01`, { month: "long", year: "numeric" });
}
export function shortMonth(value: string): string {
  return displayDate(`${value}-01`, { month: "short", year: "numeric" });
}
export function localDateTime(iso: string | null, zone: string): string | null {
  return iso ? todayInZone(zone, new Date(iso)) : null;
}
export function inRange(
  value: string | null | undefined,
  start: string,
  end: string,
): boolean {
  return !!value && value >= start && value <= end;
}
export function cycleDefaultDate(month: string, today: string): string {
  return today.startsWith(month) ? today : `${month}-01`;
}
export function nextMonth(month: string): string {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}
export function getTime(zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}
export function greeting(zone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
