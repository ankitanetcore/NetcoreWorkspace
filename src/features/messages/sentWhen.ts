const dayMs = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const sinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

export function sentDay(sentAt: string | undefined, now = new Date()) {
  const parsed = Date.parse(sentAt || "");
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const sent = startOfDay(new Date(parsed));
  const today = startOfDay(now);
  const daysAgo = Math.round((today.getTime() - sent.getTime()) / dayMs);
  if (daysAgo <= 0) {
    return "Today";
  }
  if (daysAgo === 1) {
    return "Yesterday";
  }
  const thisWeek = startOfWeek(now);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  if (sent >= lastWeek && sent < thisWeek) {
    return "Last week";
  }
  const when = new Date(parsed);
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
