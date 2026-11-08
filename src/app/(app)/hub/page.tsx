import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import HubDashboard from "@/components/hub/HubDashboard";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[^a-zA-Z]/g, "") || local;
}

export default async function HubPage() {
  const session = await getSession();
  if (!session) return <HubDashboard name="there" />;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }).catch(() => null);
  const first = user?.name?.trim().split(/\s+/)[0];
  return <HubDashboard name={capitalize(first || fromEmail(session.email))} />;
}
