web: node apps/api/src/index.js
release: psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql
