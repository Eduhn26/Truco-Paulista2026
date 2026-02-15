-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "pointsToWin" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);
