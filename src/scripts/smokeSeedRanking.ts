import { PrismaClient } from '@game/generated/prisma';

type SmokeRankingEntry = {
  provider: string;
  providerUserId: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

const prisma = new PrismaClient();

const smokeEntries: SmokeRankingEntry[] = [
  {
    provider: 'smoke-ranking',
    providerUserId: 'smoke-ana',
    displayName: 'Smoke Ana',
    rating: 1240,
    wins: 18,
    losses: 7,
    matchesPlayed: 25,
  },
  {
    provider: 'smoke-ranking',
    providerUserId: 'smoke-bruno',
    displayName: 'Smoke Bruno',
    rating: 1185,
    wins: 14,
    losses: 9,
    matchesPlayed: 23,
  },
  {
    provider: 'smoke-ranking',
    providerUserId: 'smoke-carla',
    displayName: 'Smoke Carla',
    rating: 1130,
    wins: 11,
    losses: 8,
    matchesPlayed: 19,
  },
  {
    provider: 'smoke-ranking',
    providerUserId: 'smoke-diego',
    displayName: 'Smoke Diego',
    rating: 1075,
    wins: 9,
    losses: 10,
    matchesPlayed: 19,
  },
  {
    provider: 'smoke-ranking',
    providerUserId: 'smoke-evelyn',
    displayName: 'Smoke Evelyn',
    rating: 1035,
    wins: 7,
    losses: 11,
    matchesPlayed: 18,
  },
];

async function upsertSmokeEntry(entry: SmokeRankingEntry): Promise<void> {
  const user = await prisma.user.upsert({
    where: {
      provider_providerUserId: {
        provider: entry.provider,
        providerUserId: entry.providerUserId,
      },
    },
    update: {
      displayName: entry.displayName,
    },
    create: {
      provider: entry.provider,
      providerUserId: entry.providerUserId,
      displayName: entry.displayName,
    },
  });

  await prisma.playerProfile.upsert({
    where: {
      userId: user.id,
    },
    update: {
      rating: entry.rating,
      wins: entry.wins,
      losses: entry.losses,
      matchesPlayed: entry.matchesPlayed,
    },
    create: {
      userId: user.id,
      rating: entry.rating,
      wins: entry.wins,
      losses: entry.losses,
      matchesPlayed: entry.matchesPlayed,
    },
  });
}

async function main(): Promise<void> {
  console.log('[smoke:ranking] connecting to database...');
  await prisma.$connect();

  // NOTE: These users live behind a dedicated provider namespace so the smoke
  // seed is easy to recognize in the UI and easy to clean up later if needed.
  for (const entry of smokeEntries) {
    await upsertSmokeEntry(entry);
  }

  const ranking = await prisma.playerProfile.findMany({
    orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { matchesPlayed: 'desc' }],
    take: 10,
    include: {
      user: {
        select: {
          displayName: true,
          provider: true,
          providerUserId: true,
        },
      },
    },
  });

  console.log('[smoke:ranking] seeded entries:');
  for (const [index, profile] of ranking.entries()) {
    console.log(
      `${index + 1}. ${profile.user.displayName ?? 'Unknown'} | rating=${profile.rating} | wins=${profile.wins} | matches=${profile.matchesPlayed} | provider=${profile.user.provider}`,
    );
  }

  console.log('[smoke:ranking] done.');
}

main()
  .catch((error: unknown) => {
    console.error('[smoke:ranking] failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });