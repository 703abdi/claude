export type Zone = "INBOX" | "WORKSHOP" | "DESK" | "PARK" | "AWAY";

export const ZONE_LABEL: Record<Zone, string> = {
  INBOX: "Inbox",
  WORKSHOP: "Workshop",
  DESK: "Front desk",
  PARK: "Park",
  AWAY: "Off the map",
};

export function zoneFor(input: {
  status: "IDLE" | "WORKING" | "BLOCKED" | "OFFLINE";
  queued: number;
  lastRunFailed: boolean;
}): Zone {
  if (input.status === "WORKING") return "WORKSHOP";
  if (input.status === "BLOCKED" || input.lastRunFailed) return "DESK";
  if (input.queued > 0) return "INBOX";
  if (input.status === "OFFLINE") return "AWAY";
  return "PARK";
}
