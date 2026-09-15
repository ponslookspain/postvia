/**
 * Local calendar date keys ("yyyy-MM-dd") without UTC shifts.
 * Pure date math shared by the schedule picker and its callers — kept
 * out of the picker component module so importing a parser never pulls
 * `react-day-picker` into a bundle (see ScheduleDatePicker).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local "yyyy-MM-dd" key without UTC shifts (noon avoids DST edges). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
