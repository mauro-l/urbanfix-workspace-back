# Entorno local con Docker (QA y Frontend)

Este documento es el paso a paso para levantar el backend completo en tu máquina, sin instalar Node, Prisma ni
PostgreSQL. Todo corre en contenedores y usa **las mismas migraciones** que producción.

Si algo falla, mandá el error y la salida de `docker compose --env-file docker.env logs` al responsable del backend.

---

## 1. Requisitos

- **Docker Desktop** (Windows/macOS) o **Docker Engine + Docker Compose v2** (Linux/WSL).
- Verificá que estén instalados:

```sh
docker --version
docker compose version
```

La versión de Compose debe ser **2.17 o superior**.

> **Windows:** usá WSL2 (Ubuntu) y ejecutá todo desde la terminal de WSL, no desde PowerShell.

---

## 2. Primer arranque (una sola vez)

```sh
git clone <URL-DEL-REPO>
cd urban-fix-server/backend
cp docker.env.example docker.env
docker compose --env-file docker.env up -d --build
```

El primer arranque tarda unos minutos porque descarga imágenes y compila la API. Los siguientes son rápidos.

Verificá que quedó arriba:

```sh
docker compose --env-file docker.env ps
```

Tenés que ver `db` y `api` en estado `running`/`healthy`.

---

## 3. Qué queda disponible

| Servicio | URL / puerto | Para qué |
| --- | --- | --- |
| API | http://127.0.0.1:3001 | Endpoints del backend |
| Health | http://127.0.0.1:3001/health | Verificar que responde |
| Swagger UI | http://127.0.0.1:3001/docs | Probar endpoints a mano |
| OpenAPI JSON | http://127.0.0.1:3001/openapi.json | Generar clientes |
| PostgreSQL | `127.0.0.1:5433` | Base de datos local |

La base arranca **con el schema ya migrado**. No hace falta ejecutar SQL a mano.

Configuración del frontend:

```env
VITE_API_URL=http://localhost:3001
```

---

## 4. Datos de prueba (seed)

El seed es **opcional** y no se ejecuta solo, para no pisar datos que hayas creado probando.

```sh
docker compose --env-file docker.env run --rm seed
```

Usuarios disponibles (todos con contraseña `Urbanfix123!`):

| Email | Rol |
| --- | --- |
| `cliente@urbanfix.test` | CLIENTE |
| `tecnico@urbanfix.test` | TECNICO |
| `admin@urbanfix.test` | ADMIN |

También crea 4 servicios (plomería, electricidad, pintura, carpintería) y 2 solicitudes de ejemplo.

Podés ejecutarlo varias veces: actualiza solo los registros de demo, no duplica.

---

## 5. Comandos del día a día

Siempre desde `urban-fix-server/backend`.

**Traer cambios y actualizar el entorno** (después de cada `git pull`):

```sh
git pull
docker compose --env-file docker.env up -d --build
```

Esto recompila la API y aplica las migraciones nuevas automáticamente.

**Ver logs:**

```sh
docker compose --env-file docker.env logs -f api
docker compose --env-file docker.env logs -f db
```

**Apagar sin perder datos:**

```sh
docker compose --env-file docker.env down
```

**Borrar todo y empezar de cero** (⚠️ elimina la base local):

```sh
docker compose --env-file docker.env down -v
docker compose --env-file docker.env up -d --build
docker compose --env-file docker.env run --rm seed
```

**Solo la base de datos** (si querés mockear el backend desde el front):

```sh
docker compose --env-file docker.env up -d db migrate
```

**Entrar a PostgreSQL:**

```sh
docker compose --env-file docker.env exec db psql -U urbanfix -d urbanfix_dev
```

---

## 6. Reglas del entorno

1. **No modifiques el schema de la base a mano.** Ni `ALTER TABLE`, ni `prisma db push`, ni cambios desde un
   cliente SQL. El schema se cambia solo con migraciones en el repo.
2. **Si necesitás un campo, tabla o endpoint nuevo, pedilo al backend.** Nosotros creamos la migración y llega
   con el `git pull`.
3. **No uses tu base local para datos que necesitás conservar.** Es descartable.
4. **Nunca apuntes tu entorno local a Neon.** `docker.env` es solo para Docker/host local; producción vive en Neon
   y se configura únicamente en Render.
5. **No commitees `docker.env`.** Ya está ignorado por git; contiene credenciales locales.

---

## 7. Problemas comunes

**`port is already allocated` (5433 o 3001)**
Ya hay algo usando el puerto. Cerrá el otro proceso o cambiá el puerto en `docker.env`:

```env
POSTGRES_PORT=5434
API_PORT=3002
```

y volvé a ejecutar `up`.

**`docker: command not found` / `Cannot connect to the Docker daemon`**
Docker no está corriendo. Abrí Docker Desktop o, en Linux:

```sh
sudo systemctl start docker
```

**La API responde 500 o no arranca**
Mirá los logs y verificá que `migrate` haya terminado bien:

```sh
docker compose --env-file docker.env logs migrate
docker compose --env-file docker.env logs api
```

**Cambié de rama y la base quedó rara**
Casi siempre alcanza con reconstruir:

```sh
docker compose --env-file docker.env up -d --build
```

Si el problema persiste, reset completo (sección 5).

**En Windows los archivos se ven con permisos raros**
Asegurate de estar trabajando dentro de WSL (`\\wsl$`), no en `/mnt/c/...`.
