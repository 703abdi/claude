import { after } from "next/server";
import { syncFathom } from "@/lib/fathom";
import { syncCalendly } from "@/lib/calendly";
import { syncGoogle } from "@/lib/google";

/** Pulls from every live source without holding up the page. Called from the Hub read:
 * the response goes out first, then Fathom, Calendly and Google run in the same function
 * invocation (Next `after`). Each pull keeps its own throttle, so opening the Hub ten times
 * in a row costs one pull. The morning cron forces all three regardless. */
export function scheduleBackgroundSyncs(tz?: string) {
  const run = async () => {
    await Promise.all([
      syncFathom({ tz }).catch(() => null),
      syncCalendly({ tz }).catch(() => null),
      syncGoogle({ tz }).catch(() => null),
    ]);
  };
  try {
    after(run);
  } catch {
    // Outside a request (scripts, tests): just run it.
    void run();
  }
}
