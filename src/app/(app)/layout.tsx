import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NavShell from "@/components/NavShell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <NavShell email={session.email}>{children}</NavShell>;
}
