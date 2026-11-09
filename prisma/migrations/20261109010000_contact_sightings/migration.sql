-- CreateTable
CREATE TABLE "ContactSighting" (
    "key" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personId" TEXT,
    CONSTRAINT "ContactSighting_pkey" PRIMARY KEY ("key")
);
