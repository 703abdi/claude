// Prayer times worked out on the device with the adhan library (ISNA method).
// Pure functions only: no browser APIs, so the server and tests can use them too.
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";

export type PrayerName = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

export type DayTimes = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

export type NextPrayer = { name: PrayerName; at: Date; minutesAway: number };

/** The five prayers plus sunrise for the calendar day of `date` (in the runtime's local time). */
export function prayerTimesFor(lat: number, lng: number, date: Date): DayTimes {
  const t = new PrayerTimes(new Coordinates(lat, lng), date, CalculationMethod.NorthAmerica());
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

/** The next of the five prayers after `now`. After Isha it is tomorrow's Fajr. */
export function nextPrayer(lat: number, lng: number, now: Date): NextPrayer {
  const today = prayerTimesFor(lat, lng, now);
  const order: [PrayerName, Date][] = [
    ["Fajr", today.fajr],
    ["Dhuhr", today.dhuhr],
    ["Asr", today.asr],
    ["Maghrib", today.maghrib],
    ["Isha", today.isha],
  ];
  let found = order.find(([, at]) => at.getTime() > now.getTime());
  if (!found) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    found = ["Fajr", prayerTimesFor(lat, lng, tomorrow).fajr];
  }
  const [name, at] = found;
  return { name, at, minutesAway: Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 60000)) };
}

/** "2:41pm" in the runtime's local time. */
export function clock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

function shortGap(min: number): string {
  if (min < 1) return "now";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `in ${m}m`;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function longGap(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hs = h === 1 ? "1 hour" : `${h} hours`;
  const ms = m === 1 ? "1 minute" : `${m} minutes`;
  if (h === 0) return `in ${ms}`;
  return m === 0 ? `in ${hs}` : `in ${hs} ${ms}`;
}

/** One short line, for example "Asr 2:41pm · in 1h 12m". */
export function formatPrayerLine(next: NextPrayer, now: Date): string {
  const min = Math.max(0, Math.ceil((next.at.getTime() - now.getTime()) / 60000));
  return `${next.name} ${clock(next.at)} · ${shortGap(min)}`;
}

/** A sentence for speech, for example "Asr is at 2:41pm, in 1 hour 12 minutes." */
export function spokenPrayerLine(next: NextPrayer, now: Date): string {
  const min = Math.max(0, Math.ceil((next.at.getTime() - now.getTime()) / 60000));
  if (min < 1) return `${next.name} is now, at ${clock(next.at)}.`;
  return `${next.name} is at ${clock(next.at)}, ${longGap(min)}.`;
}
