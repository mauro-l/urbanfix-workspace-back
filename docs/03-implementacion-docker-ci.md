# Implementación: Docker, Compose y CI del backend

Documento técnico interno. Explica **cómo** quedó armado el entorno reproducible y **por qué** cada decisión
existe. La guía para QA/frontend es [`02-entorno-local-docker.md`](./02-entorno-local-docker.md).

---

## 1. Problema que resuelve

Antes: producción (Neon) avanzaba por un lado y el entorno local quedaba viejo. Dos fuentes de verdad → drift.

Ahora: **`prisma/migrations/` es la única fuente de verdad del schema.** Producción, CI y cada máquina local
aplican exactamente los mismos archivos. Nadie crea tablas a mano.

Regla operativa:

| Rol | Puede hacer | No puede hacer |
| --- | --- | --- |
| Backend | `prisma migrate dev` (crear migraciones), `db:deploy` | editar la DB a mano |
| QA / Front | `docker compose up` (aplica migraciones), `seed` | `migrate dev`, `db push`, SQL manual |
| CI | `migrate diff`, `migrate deploy`, levantar el stack | escribir en producción |
| Render | `prisma migrate deploy` en `startCommand` | — |

---

## 2. Archivos y responsabilidad

| Archivo | Qué hace |
| --- | --- |
| `backend/Dockerfile` | Multi-stage: `deps` → `build` → `prod-deps` → `runtime` / `migrator` |
| `backend/.dockerignore` | Excluye `node_modules`, `dist`, `.env*`, `docker.env`, `.neon`, `.git` de la imagen |
| `backend/compose.yaml` | `db`, `migrate` (one-shot), `seed` (opt-in), `api` |
| `backend/prisma/seed.ts` | Datos demo idempotentes con IDs fijos |
| `backend/package.json` | `db:deploy`, `db:seed`, `docker:up`, `docker:down`, `docker:reset`, `prisma.seed` |
| `.github/workflows/backend-ci.yml` | Typecheck, drift check, migraciones en DB limpia, smoke test del stack |
| `backend/README.md` | Punto de entrada corto; delega en los docs |
| `render.yaml` | Sin cambios: ya ejecuta `prisma migrate deploy` antes de arrancar |

`backend/.env` (Neon) **no lo usa Compose**. Los contenedores construyen su propia `DATABASE_URL` contra el
servicio `db`. `docker.env` es solo para correr la API en el host y para interpolar variables de Compose.

---

## 3. Dockerfile: por qué cuatro stages

```
base (node:24-alpine + openssl + libc6-compat)
 ├── deps        npm ci --include=dev
 │    ├── build      prisma generate + tsc  → dist/
 │    └── migrator   prisma CLI + prisma/   → migrate deploy / db seed
 └── prod-deps   npm ci --omit=dev
      └── runtime  dist + node_modules prod + cliente Prisma → node dist/index.js
```

Decisiones:

- **Node 24** = misma major que Render (`NODE_VERSION=24`). Evita "funciona en mi máquina".
- **`openssl` + `libc6-compat`**: los engines de Prisma en Alpine los necesitan. Sin esto, `prisma` falla en runtime.
- **`migrator` separado**: la imagen de la API no lleva el CLI de Prisma ni devDependencies. El runner de
  migraciones sí, porque `migrate deploy` y `db seed` lo necesitan.
- **`prisma generate` también en `migrator`**: el `@prisma/client` que instala npm es un stub sin inicializar.
  Sin `generate`, el seed explota con `@prisma/client did not initialize yet` (bug detectado en la verificación).
- **`USER node`**: la API corre sin root.
- **`.env` nunca se copia**: las credenciales de Neon no entran en ninguna imagen.

---

## 4. Compose: qué hace cada servicio

```
db (postgres:16.15-alpine, healthcheck)
   ↑ service_healthy
migrate (one-shot, prisma migrate deploy)  ── exit 0 ──▶ api
                                                        ↑
seed (opt-in, profile "seed", prisma db seed) ──────────┘
```

- **`db`**: Postgres 16.15-alpine, volumen nombrado `postgres-data`, bind solo a `127.0.0.1:5433`.
  La versión está pinneada a propósito (misma major que Neon).
- **`migrate`**: depende de `db` healthy, aplica migraciones y termina con exit 0. Si falla, `api` no arranca.
  Esto convierte "me olvidé de migrar" en un error evidente, no en un bug silencioso.
- **`api`**: depende de `migrate: service_completed_successfully`. Healthcheck con `wget /health`. Sin build
  de dev: la imagen es la de producción.
- **`seed`**: `profiles: ["seed"]`. `up` **no** lo ejecuta; se corre explícito con `run --rm seed`. Motivo: no
  pisar fixtures que QA haya creado. Es idempotente (upsert por email/slug/ID fijo).
- **Sin `env_file` en contenedores**: si se inyectara `docker.env`, `DATABASE_URL` apuntaría a `127.0.0.1`
  dentro del contenedor y rompería. Por eso las URLs se arman con `POSTGRES_*` y host `db`.
- **Nombre de proyecto por defecto** (`backend`): conserva el volumen existente; no hay migración de datos
  local ni volumen nuevo.

Puertos: `5433` (DB) y `3001` (API), ambos en loopback. Configurables con `POSTGRES_PORT` y `API_PORT`.

---

## 5. CI: las dos barreras

`.github/workflows/backend-ci.yml` corre en push a `main` y en PRs que tocan `backend/`.

### Job `quality`

1. `npm ci --include=dev` (mismo flag que Render; sin él, `tsc` falla por tipos faltantes).
2. `prisma generate` + `npm run typecheck`.
3. Crea una base shadow y ejecuta:

```sh
prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
```

`--exit-code` devuelve **2** si `schema.prisma` y las migraciones no coinciden. Ese es el detector de drift:
si alguien edita el schema sin crear la migración, el PR no pasa.

4. `prisma migrate deploy` sobre una base limpia + `migrate status`: valida que las migraciones apliquen desde
   cero (no solo sobre una base ya migrada).

### Job `docker-stack`

1. `docker compose config -q`: valida sintaxis e interpolación.
2. `docker compose build`: construye `runtime` y `migrator` (rompe si el Dockerfile se desactualiza).
3. `docker compose up -d`: levanta el stack real.
4. Espera `/health` (60 intentos × 2 s). Si `migrate` falla, esto nunca responde y el job falla.
5. Verifica por SQL que existan `public.users` y `public._prisma_migrations`.
6. `down -v` siempre (`if: always()`), sin dejar basura.

Esto reproduce en CI lo que vive QA, así que un `compose.yaml` roto se detecta antes del `git pull`.

---

## 6. Flujo al cambiar el schema (solo backend)

```sh
# 1. Editar prisma/schema.prisma
# 2. Crear la migración versionada
npm run db:migrate -- --name add_whatever
# 3. Verificar en local
npm run db:deploy
# 4. Commit: schema + migrations/
```

Qué pasa después:

- **CI**: valida drift, aplica migraciones en limpio y levanta el stack.
- **QA/front**: `git pull && docker compose --env-file docker.env up -d --build` → migración aplicada sola.
- **Render**: `startCommand` ejecuta `prisma migrate deploy` antes de `npm run start`.
- **Neon**: recibe la misma migración, sin SQL manual.

Nunca usar `prisma db push` en este repo: no genera archivos versionados y produce drift invisible.

---

## 7. Producción (sin cambios de diseño)

- Neon: branch `main`, base `neondb`. `DATABASE_URL` pooled + `DIRECT_URL` directa.
- Render: `rootDir: backend`, build `npm ci --include=dev && prisma generate && npm run build`,
  start `prisma migrate deploy && npm run start`, healthcheck `/health`.
- El deploy no usa Docker: Render compila con Node 24. El Dockerfile es para local/CI, no para producción.
  Esto es intencional: menos superficie de error y el plan free de Render no requiere imagen.

---

## 8. Verificación ejecutada (2026-11-05)

Todo se probó con un proyecto Compose aislado (`urbanfix-verify`) y puertos alternos (`55433`/`33001`) para no
tocar otros contenedores de la máquina.

| Prueba | Resultado |
| --- | --- |
| `docker compose config -q` | OK |
| Build `api` + `migrate` + `seed` | OK |
| `up -d` | `db` healthy → `migrate` exit 0 → `api` healthy |
| Migración aplicada | `20261102212435_init` |
| Tablas creadas | `_prisma_migrations`, `service_requests`, `services`, `users` |
| `GET /health` | `200 {"status":"ok",...}` |
| `GET /docs` | `301` (redirect normal a `/docs/`) |
| Seed (2 ejecuciones) | 3 usuarios, 4 servicios, 2 solicitudes (sin duplicados) |
| `prisma migrate diff --exit-code` | `No difference detected`, exit 0 |
| `npm run typecheck` | exit 0 |
| Limpieza | `down -v`, sin contenedores ni volúmenes residuales |

Bug corregido durante la verificación: el stage `migrator` no ejecutaba `prisma generate`, por lo que el seed
fallaba con `@prisma/client did not initialize yet`. Se agregó el `RUN npx prisma generate`.

---

## 9. Limitaciones conocidas y próximos pasos

1. **Sin tests automatizados todavía.** El CI valida tipos, drift y que el stack arranque, no comportamiento de
   endpoints. Próximo paso: Vitest/Supertest contra el stack de CI.
2. **Sin entorno staging.** Neon tiene una sola branch (`main`) y Render un solo servicio. Cuando QA necesite
   datos persistentes aislados: branch de Neon + segundo servicio Render con su propia `DATABASE_URL`.
3. **`package.json#prisma` está deprecado** en Prisma 7. Migrar a `prisma.config.ts` cuando se actualice Prisma.
4. **Puerto 5433 ocupado**: en esta máquina lo usa `app-acero-db`. Para UrbanFix local, definir
   `POSTGRES_PORT=5434` en `docker.env` (y `API_PORT` si 3001 está tomado).
5. **Postgres local ≠ Neon**: misma major (16), no el mismo motor exacto. Suficiente para el MVP; el drift real
   se controla con migraciones, no con el motor.
6. **`seed` es demo, no fixture de tests.** Si crece, separarlo en `prisma/seed.dev.ts` y un fixture determinista
   para tests.
