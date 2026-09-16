import { getPeopleWithCounts } from "@/lib/people-data";
import PeopleGrid from "@/components/people/PeopleGrid";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const people = await getPeopleWithCounts();
  return <PeopleGrid initialPeople={people} />;
}
