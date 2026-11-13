import { getPeopleSummaries } from "@/lib/people-data";
import PeopleShell from "@/components/people/PeopleShell";

export const dynamic = "force-dynamic";

export default async function PeopleLayout({ children }: LayoutProps<"/people">) {
  const people = await getPeopleSummaries();
  return <PeopleShell people={people}>{children}</PeopleShell>;
}
