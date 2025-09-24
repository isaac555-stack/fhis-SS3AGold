# SDMS (Shinelight Database Management System)

Node.js + Express + EJS + PostgreSQL (Supabase-ready)

## Prerequisites
- Node.js 18+
- PostgreSQL (for local dev only)
- Supabase account (for production DB)

## Configure Environment
1. Copy .env.example to .env and set values:
   - DATABASE_URL for Supabase (e.g., postgres://postgres:<PASSWORD>@<HOST>:5432/postgres?sslmode=require)
   - Optional PG* vars for local development.

```
cp .env.example .env
# then edit .env
```

## Install
```
npm install
```

If you hit a devDependency resolver issue on install, you can omit dev deps:
```
npm install --omit=dev
```

## Run
```
npm run start
# http://localhost:3000
```

## Supabase Setup
1. Create a Supabase project.
2. Open the SQL editor and paste the contents of db/schema.sql to create tables.
3. In Project Settings → Database → Connection string, copy your DATABASE_URL (ensure it includes sslmode=require) and set it in .env.

## Migrate Existing Local Data to Supabase
Export from local Postgres:
```
pg_dump -h localhost -U postgres -d SDMS -f sdms.sql
```
Import to Supabase:
```
psql "<YOUR_SUPABASE_DATABASE_URL>" -f sdms.sql
```
Or export/import selected tables only:
```
pg_dump -h localhost -U postgres -d SDMS -t classes -t students -t payments -f sdms_tables.sql
psql "<YOUR_SUPABASE_DATABASE_URL>" -f sdms_tables.sql
```

Notes:
- Remove CREATE DATABASE statements in dumps if present.
- Ensure the connection string includes `sslmode=require`.

## GitHub
Initialize remote and push:
```
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git add .
git commit -m "Initial SDMS commit"
git push -u origin main
```

.env is ignored by .gitignore, do not commit secrets.

## Scripts
- start: node server.js
- dev: nodemon server.js

## Tech
- express, ejs, pg, puppeteer
- Supabase Postgres via DATABASE_URL with SSL
