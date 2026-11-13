import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrayerLine, nextPrayer, prayerTimesFor, spokenPrayerLine } from "../prayer";

// Washington DC. Run with TZ=America/New_York (npm test sets it).
const LAT = 38.9072;
const LNG = -77.0369;
const DAY = new Date(2026, 10, 13, 12, 0); // Fri Nov 13 2026, noon local

function hm(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}
function at(h: number, m: number) {
  return h * 60 + m;
}

test("the six times come in order on the right day", () => {
  const t = prayerTimesFor(LAT, LNG, DAY);
  const list = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha];
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1] < list[i], `time ${i - 1} should be before time ${i}`);
  for (const d of list) assert.equal(d.getDate(), 13);
});

test("Dhuhr and Maghrib fall inside sane windows for DC in mid November", () => {
  const t = prayerTimesFor(LAT, LNG, DAY);
  assert.ok(hm(t.dhuhr) >= at(11, 45) && hm(t.dhuhr) <= at(12, 15), `Dhuhr ${t.dhuhr}`);
  assert.ok(hm(t.maghrib) >= at(16, 45) && hm(t.maghrib) <= at(17, 15), `Maghrib ${t.maghrib}`);
});

test("times match ISNA values worked out by hand, within 2 minutes", () => {
  // Solar noon in DC on Nov 13 is about 11:52 (12:08 for 77.04 W, less about 15.7 min equation of time);
  // sunset about 16:55; ISNA uses 15 degrees for both Fajr and Isha; Asr is the standard shadow rule.
  const t = prayerTimesFor(LAT, LNG, DAY);
  const expected: [string, Date, number][] = [
    ["fajr", t.fajr, at(5, 32)],
    ["sunrise", t.sunrise, at(6, 49)],
    ["dhuhr", t.dhuhr, at(11, 53)],
    ["asr", t.asr, at(14, 34)],
    ["maghrib", t.maghrib, at(16, 56)],
    ["isha", t.isha, at(18, 12)],
  ];
  for (const [name, d, want] of expected) assert.ok(Math.abs(hm(d) - want) <= 2, `${name} was ${d.toTimeString()}`);
});

test("before Fajr the next prayer is today's Fajr", () => {
  const now = new Date(2026, 10, 13, 3, 0);
  const n = nextPrayer(LAT, LNG, now);
  const t = prayerTimesFor(LAT, LNG, now);
  assert.equal(n.name, "Fajr");
  assert.equal(n.at.getTime(), t.fajr.getTime());
  assert.equal(n.minutesAway, Math.ceil((t.fajr.getTime() - now.getTime()) / 60000));
});

test("mid-day after Dhuhr the next prayer is Asr", () => {
  const now = new Date(2026, 10, 13, 13, 0);
  const n = nextPrayer(LAT, LNG, now);
  assert.equal(n.name, "Asr");
  assert.equal(n.at.getTime(), prayerTimesFor(LAT, LNG, now).asr.getTime());
});

test("after Isha it rolls to tomorrow's Fajr", () => {
  const now = new Date(2026, 10, 13, 22, 30);
  const n = nextPrayer(LAT, LNG, now);
  const tomorrow = prayerTimesFor(LAT, LNG, new Date(2026, 10, 14, 12));
  assert.equal(n.name, "Fajr");
  assert.equal(n.at.getDate(), 14);
  assert.equal(n.at.getTime(), tomorrow.fajr.getTime());
  assert.ok(n.minutesAway > 6 * 60 && n.minutesAway < 8 * 60);
});

test("formatPrayerLine and the spoken sentence read plainly", () => {
  const now = new Date(2026, 10, 13, 13, 22);
  const n = { name: "Asr" as const, at: new Date(2026, 10, 13, 14, 34), minutesAway: 72 };
  assert.equal(formatPrayerLine(n, now), "Asr 2:34pm · in 1h 12m");
  assert.equal(spokenPrayerLine(n, now), "Asr is at 2:34pm, in 1 hour 12 minutes.");
  const soon = { name: "Maghrib" as const, at: new Date(2026, 10, 13, 16, 56), minutesAway: 5 };
  assert.equal(formatPrayerLine(soon, new Date(2026, 10, 13, 16, 51)), "Maghrib 4:56pm · in 5m");
  assert.equal(formatPrayerLine(soon, new Date(2026, 10, 13, 13, 56)), "Maghrib 4:56pm · in 3h");
  const fajr = { name: "Fajr" as const, at: new Date(2026, 10, 14, 5, 33), minutesAway: 0 };
  assert.equal(formatPrayerLine(fajr, new Date(2026, 10, 14, 4, 32)), "Fajr 5:33am · in 1h 1m");
});
