-- Public player identity used by rankings, match cards, and saved match records.
ALTER TABLE "PlayerProfile" ADD COLUMN "publicName" TEXT;
ALTER TABLE "PlayerProfile" ADD COLUMN "publicSlug" TEXT;

-- Keep existing users readable immediately; custom editing can refine the slug later.
UPDATE "PlayerProfile" AS profile
SET "publicName" = NULLIF(TRIM("User"."displayName"), '')
FROM "User"
WHERE profile."userId" = "User"."id"
  AND NULLIF(TRIM("User"."displayName"), '') IS NOT NULL;

CREATE UNIQUE INDEX "PlayerProfile_publicSlug_key" ON "PlayerProfile"("publicSlug");
