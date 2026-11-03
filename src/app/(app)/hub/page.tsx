import { getSession } from "@/lib/auth";
import HubDashboard from "@/components/hub/HubDashboard";

function displayName(email: string) {
  const local = email.split("@")[0] ?? email;
  const letters = local.replace(/[^a-zA-Z]/g, "");
  const name = letters || local;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default async function HubPage() {
  const session = await getSession();
  return <HubDashboard name={session ? displayName(session.email) : "there"} />;
}
