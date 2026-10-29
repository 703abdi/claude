export function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}
export function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0);
}

/** Returns a 6x7 grid of dates covering the month, starting on Sunday. */
export function getMonthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(year, month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
