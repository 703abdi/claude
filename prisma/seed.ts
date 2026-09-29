import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/lib/db-seed";

const prisma = new PrismaClient();

runSeed(prisma)
  .then((result) => {
    for (const line of result.log) console.log(line);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
