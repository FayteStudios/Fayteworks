export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const DAY_LABEL: Record<(typeof DAYS)[number], string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

export const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;
export const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function validZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const localZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const stamp = (local: string) => local.replace(/[-:]/g, "").replace(" ", "T").slice(0, 13) + "00";

export function addMinutes(local: string, minutes: number): string {
  const m = local.match(LOCAL_TIME);
  if (!m) return local;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + minutes * 60000);
  return d.toISOString().slice(0, 16);
}

export function nextDay(day: (typeof DAYS)[number], from = new Date()): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  d.setUTCDate(d.getUTCDate() + ((DAYS.indexOf(day) - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  tz: string;
  location?: string;
  details?: string;
  url?: string;
  weekly?: (typeof DAYS)[number];
}

export function icsFile(e: CalendarEvent): string {
  const zone = validZone(e.tz) ? `;TZID=${e.tz}` : "";
  const uid = `${stamp(e.start)}-${Math.abs([...e.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)}@fayteworks`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FayteWorks//Event//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART${zone}:${stamp(e.start)}`,
    `DTEND${zone}:${stamp(e.end)}`,
    e.weekly ? `RRULE:FREQ=WEEKLY;BYDAY=${e.weekly.slice(0, 2).toUpperCase()}` : "",
    `SUMMARY:${icsText(e.title)}`,
    e.location ? `LOCATION:${icsText(e.location)}` : "",
    e.details || e.url ? `DESCRIPTION:${icsText([e.details, e.url].filter(Boolean).join("\n\n"))}` : "",
    e.url ? `URL:${e.url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ]
    .filter(Boolean)
    .join("\r\n");
}

export const icsHref = (e: CalendarEvent) => `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFile(e))}`;

export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}` });
  if (validZone(e.tz)) q.set("ctz", e.tz);
  if (e.details || e.url) q.set("details", [e.details, e.url].filter(Boolean).join("\n\n"));
  if (e.location) q.set("location", e.location);
  if (e.weekly) q.set("recur", `RRULE:FREQ=WEEKLY;BYDAY=${e.weekly.slice(0, 2).toUpperCase()}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function clockLabel(time: string, clock: "12" | "24"): string {
  const m = time.match(CLOCK);
  if (!m) return time;
  const h = Number(m[1]);
  return clock === "24" ? `${String(h).padStart(2, "0")}:${m[2]}` : `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function zoneLabel(tz: string, date = new Date()): string {
  if (!validZone(tz)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function dateLabel(local: string, clock: "12" | "24" = "12"): string {
  const m = local.match(LOCAL_TIME);
  if (!m) return local;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${clockLabel(`${m[4]}:${m[5]}`, clock)}`;
}
