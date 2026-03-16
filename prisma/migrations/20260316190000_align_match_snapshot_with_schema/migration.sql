-- NOTE:
-- This migration aligns the actual database structure with the current Prisma schema.
-- The original migration created a table named "Match", but the application now
-- persists matches using the "MatchSnapshot" model with fields "matchId" and "score".
--
-- Strategy:
-- 1. Create the new "MatchSnapshot" table with the correct schema
-- 2. Migrate legacy data from the old "Match" table
-- 3. Drop the old table to remove structural drift between schema and migrations

CREATE TABLE "MatchSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "pointsToWin" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "score" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchSnapshot_matchId_key" ON "MatchSnapshot"("matchId");

-- NOTE:
-- Legacy rows from the old "Match" table do not contain a "score" column.
-- A default score structure is injected to preserve compatibility with
-- the current domain snapshot format.

INSERT INTO "MatchSnapshot" (
    "id",
    "matchId",
    "pointsToWin",
    "state",
    "score",
    "data",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text),
    "id",
    "pointsToWin",
    "state",
    jsonb_build_object('playerOne', 0, 'playerTwo', 0),
    "data",
    "createdAt",
    "updatedAt"
FROM "Match";

-- NOTE:
-- The old table is removed to prevent future migrations from drifting
-- away from the Prisma schema definition.

DROP TABLE "Match";