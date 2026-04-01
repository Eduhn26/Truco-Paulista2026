-- CreateTable
CREATE TABLE "MatchRecord" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pointsToWin" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "finalState" TEXT NOT NULL,
    "finalViraRank" TEXT,
    "finalScorePlayerOne" INTEGER NOT NULL,
    "finalScorePlayerTwo" INTEGER NOT NULL,
    "roundsPlayed" INTEGER NOT NULL,
    "winnerPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRecordParticipant" (
    "id" TEXT NOT NULL,
    "matchRecordId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT,
    "isBot" BOOLEAN NOT NULL,
    "botProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRecordParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchReplayEvent" (
    "id" TEXT NOT NULL,
    "matchRecordId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReplayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchRecord_matchId_key" ON "MatchRecord"("matchId");

-- CreateIndex
CREATE INDEX "MatchRecord_finishedAt_idx" ON "MatchRecord"("finishedAt");

-- CreateIndex
CREATE INDEX "MatchRecord_status_idx" ON "MatchRecord"("status");

-- CreateIndex
CREATE INDEX "MatchRecordParticipant_matchRecordId_idx" ON "MatchRecordParticipant"("matchRecordId");

-- CreateIndex
CREATE INDEX "MatchRecordParticipant_userId_idx" ON "MatchRecordParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRecordParticipant_matchRecordId_seatId_key" ON "MatchRecordParticipant"("matchRecordId", "seatId");

-- CreateIndex
CREATE INDEX "MatchReplayEvent_matchRecordId_idx" ON "MatchReplayEvent"("matchRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReplayEvent_matchRecordId_sequence_key" ON "MatchReplayEvent"("matchRecordId", "sequence");

-- AddForeignKey
ALTER TABLE "MatchRecordParticipant" ADD CONSTRAINT "MatchRecordParticipant_matchRecordId_fkey" FOREIGN KEY ("matchRecordId") REFERENCES "MatchRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecordParticipant" ADD CONSTRAINT "MatchRecordParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReplayEvent" ADD CONSTRAINT "MatchReplayEvent_matchRecordId_fkey" FOREIGN KEY ("matchRecordId") REFERENCES "MatchRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
