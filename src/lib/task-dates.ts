export function daysBetween(a: Date, b: Date) {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startB.getTime() - startA.getTime()) / 86400000);
}

/** Positive = days past due. 0 = due today. Negative = not due yet. Null if no due date. */
export function daysPastDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  return daysBetween(new Date(dueDate), new Date());
}

export const AUTO_CLEAR_AFTER_DAYS = 14;

export function isAutoCleared(dueDate: string | null, overdue: boolean): boolean {
  if (!overdue) return false;
  const late = daysPastDue(dueDate);
  return late !== null && late >= AUTO_CLEAR_AFTER_DAYS;
}

export function formatDue(dueDate: string | null, dueTime: string | null, overdue: boolean) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const now = new Date();
  const diffDays = daysBetween(now, d);
  let label: string;
  if (diffDays === 0) label = dueTime ? dueTime : "today";
  else if (diffDays === 1) label = "tomorrow";
  else if (diffDays === -1) label = "1d late";
  else if (overdue) label = `${Math.abs(diffDays)}d late`;
  else label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
  return { label, overdue, dueToday: diffDays === 0 };
}
