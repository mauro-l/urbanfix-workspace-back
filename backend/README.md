# Backend local development

The full local environment (PostgreSQL, schema migrations, demo seed and API) runs with Docker Compose.
The canonical instructions for QA and frontend live in [`../docs/02-entorno-local-docker.md`](../docs/02-entorno-local-docker.md).
The implementation notes (Dockerfile, Compose, CI and drift guarantees) live in
[`../docs/03-implementacion-docker-ci.md`](../docs/03-implementacion-docker-ci.md).

## Quick start

From this directory:

```sh
cp docker.env.example docker.env
docker compose --env-file docker.env up -d --build
```

That starts PostgreSQL on `127.0.0.1:5433`, applies every committed Prisma migration, and serves the API on
`http://127.0.0.1:3001` (`/health`, `/openapi.json`, `/docs`).

Optional demo data:

```sh
docker compose --env-file docker.env run --rm seed
```

Stop the stack without deleting data:

```sh
docker compose --env-file docker.env down
```

## Backend-only workflow (host process)

To iterate on the API with hot reload, run only the database and the migrator, then start the host process:

```sh
docker compose --env-file docker.env up -d db migrate

set -a
. ./docker.env
set +a

npm run db:generate
npm run dev
```

`docker.env` points `DATABASE_URL`/`DIRECT_URL` at `127.0.0.1:5433` for host processes. Containers ignore those
values and build their own URLs against the `db` service, so the Neon configuration in `.env` is never used by
Compose.

## Schema changes

The schema is owned by `prisma/migrations`. Only the backend owner runs `npm run db:migrate` (which creates
migrations). QA and frontend must never run `prisma db push` or edit the database schema by hand.

`docker compose ... up -d --build` reapplies pending migrations automatically, so after `git pull` the local
database is always at the same schema version as production.
