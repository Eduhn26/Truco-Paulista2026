#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=true -> running prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS_ON_BOOT=false -> skipping migrations on boot"
fi

exec node dist/src/main.js