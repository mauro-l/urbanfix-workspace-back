# Backend local development

## PostgreSQL with Docker Compose

This Compose setup runs PostgreSQL 16.15 locally. The API remains a host process; Neon configuration in `.env` is left unchanged.

In WSL, interactive Bash uses `~/.docker-wsl` for the Linux Docker CLI configuration so a Windows Desktop-only credential helper does not break local image pulls. The existing `~/.docker` configuration is preserved. Open a new shell or run `source ~/.bashrc` after installation.

The tracked `docker.env.example` contains local-only development credentials. Copy it once to the ignored `docker.env` file if it does not already exist:

```sh
cp docker.env.example docker.env
```

Start PostgreSQL from this directory:

```sh
docker compose --env-file docker.env up -d db
docker compose --env-file docker.env ps
docker compose --env-file docker.env exec db pg_isready -U urbanfix -d urbanfix_dev
```

The container binds PostgreSQL to `127.0.0.1:5433` to avoid conflicting with a local PostgreSQL service on `5432` and to keep the development database off other network interfaces. Its named volume keeps database files when the container stops.

To run Prisma or the API against this local database in a Bash shell, export the local settings first:

```sh
set -a
. ./docker.env
set +a
npm run db:generate
npm run dev
```

After Prisma models are added, run `npm run db:migrate` in the same shell to create the local schema. The `DIRECT_URL` points to the same local database because it does not use a pooler.

Stop the container without deleting its data:

```sh
docker compose --env-file docker.env down
```

`docker compose down -v` also deletes the named database volume and all data stored in it. Use that only when intentionally resetting the local database.
