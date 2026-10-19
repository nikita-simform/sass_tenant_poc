#!/bin/sh
set -e

echo "Applying control-plane migrations..."
npm run prisma:migrate:deploy

echo "Seeding default plans + platform admin..."
npm run seed

echo "Applying tenant-schema migrations to tenant_template..."
npm run tenant:migrate:deploy

echo "Propagating tenant-schema migrations to existing org schemas..."
npm run tenant:apply-migrations

echo "Starting application..."
exec "$@"
