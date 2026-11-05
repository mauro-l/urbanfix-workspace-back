# Contrato REST de UrbanFix — propuesta MVP

**Estado:** propuesta pendiente de aprobación del responsable del producto antes de implementar las rutas. No representa un acuerdo grupal; la validación del equipo puede hacerse después si hace falta coordinar con frontend y QA. Este documento cubre el punto 1 de Semana 2: definir endpoints, entradas y respuestas. Los nombres de rutas y propiedades de transporte se mantienen en inglés; los valores de los enums del dominio conservan los nombres definidos (`CLIENTE`, `TECNICO`, `PENDIENTE`, etc.).

## Convenciones

- Base local: `http://localhost:3001`. Producción actual: `https://urbanfix-api-6e8o.onrender.com`.
- Formato de intercambio: JSON, con propiedades en `camelCase`.
- Respuestas exitosas de recursos devuelven el recurso directamente. Las respuestas de listados incluyen `items` y `pagination` para llevar metadatos de paginación.
- Errores usan el formato simple `{ "error": "mensaje claro en español" }`, siguiendo los ejemplos de Backend de las semanas 4–6.
- Las rutas protegidas reciben `Authorization: Bearer <token>`.
- El token autentica, pero no reemplaza la regla RN-03: las acciones protegidas también deben rechazar cuentas inactivas. Validar solo el rol incluido en un JWT emitido antes de la suspensión no alcanza.
- En las rutas, `{id}` es un UUID. En Express se implementará como `:id`.
- La contraseña nunca aparece en una respuesta. `passwordHash` es interno y nunca se serializa.
- En registro, guardar únicamente un hash bcrypt de la contraseña; firmar el JWT con `JWT_SECRET` del entorno.
- Las respuestas de solicitudes incluyen `budget` como string decimal o `null`, para no perder precisión numérica.
- Los listados admiten `page` y `limit`; por ahora no admiten filtros. Se propone `page=1`, `limit=20` por defecto y máximo de 100 elementos por página.

## Catálogo de endpoints

| Método | Ruta | Acceso | Propósito |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Público | Registrar un cliente o técnico y devolver su perfil y JWT (ejemplo de Semana 3) |
| `POST` | `/api/auth/login` | Público | Validar credenciales y emitir un JWT |
| `GET` | `/api/requests` | `TECNICO` | Ver solicitudes pendientes disponibles |
| `POST` | `/api/requests` | `CLIENTE` | Crear una solicitud |
| `GET` | `/api/requests/mine` | `CLIENTE` | Ver las solicitudes propias |
| `PATCH` | `/api/requests/{id}/accept` | `TECNICO` | Aceptar una solicitud pendiente |
| `PATCH` | `/api/requests/{id}/reject` | `TECNICO` | Rechazar una solicitud sin cambiar su estado global |
| `GET` | `/api/admin/users` | `ADMIN` | Listar usuarios sin credenciales |
| `GET` | `/api/admin/requests` | `ADMIN` | Listar todas las solicitudes |

## Respuestas y errores comunes

### Error

```json
{
  "error": "Revisá los datos enviados."
}
```

Los errores conservan códigos HTTP; el cuerpo no agrega un código interno ni un objeto `details`.

| HTTP | Uso |
| --- | --- |
| `400` | JSON inválido o campos inválidos |
| `401` | Token ausente/incorrecto o credenciales inválidas |
| `403` | Usuario autenticado sin el rol requerido o cuenta inactiva |
| `404` | Recurso inexistente o no visible para ese usuario |
| `409` | Email duplicado, solicitud ya tomada o transición concurrente |
| `500` | Error inesperado; sin detalles internos |

## Detalle por endpoint

### `POST /api/auth/register`

Registra una cuenta pública. Solo acepta `CLIENTE` o `TECNICO`; nunca `ADMIN` (RN-05).

**Request**

```json
{
  "email": "ana@example.com",
  "password": "una-clave-segura",
  "fullName": "Ana Pérez",
  "phone": "+54 11 5555-0101",
  "role": "CLIENTE"
}
```

`phone` es opcional. `email`, `password`, `fullName` y `role` son obligatorios. Se recortan espacios y se normaliza el email a minúsculas antes de guardarlo (decisión confirmada). La contraseña requiere al menos 8 caracteres, siguiendo el ejemplo de autenticación de Semana 3.

**`201 Created`**

```json
{
  "user": {
    "id": "6dc74b7e-2218-45de-b2d5-bc887c313b18",
    "email": "ana@example.com",
    "fullName": "Ana Pérez",
    "phone": "+54 11 5555-0101",
    "role": "CLIENTE",
    "isActive": true,
    "createdAt": "2026-11-05T12:00:00.000Z"
  },
  "token": "<jwt>"
}
```

Errores: `400` si los datos son inválidos, `409` si el email ya está registrado, `500` ante un error inesperado.

### `POST /api/auth/login`

**Request**

```json
{
  "email": "ana@example.com",
  "password": "una-clave-segura"
}
```

**`200 OK`** — mismo objeto `user` (sin contraseña/hash) y `token` que se muestran en el ejemplo de registro.

Errores: `400` si faltan o son inválidos los campos; `401` para email/contraseña incorrectos o cuenta inactiva. La respuesta no revela cuál de esas condiciones ocurrió (RN-03).

### `GET /api/requests`

Requiere rol `TECNICO`. Devuelve solicitudes `PENDIENTE` que el técnico todavía no rechazó. No se filtra por zona (RN-27); rechazar una solicitud la oculta solo para ese técnico (RN-15).

**`200 OK`**

```json
{
  "items": [
    {
      "id": "3c9b6d7a-08cb-4c3a-aa96-5ce50e59291f",
      "clientId": "6dc74b7e-2218-45de-b2d5-bc887c313b18",
      "technicianId": null,
      "serviceId": "70d2dc01-cb7b-4c7e-8b93-47c46768dc65",
      "title": "Pérdida en la cocina",
      "description": "Gotea la canilla debajo de la mesada.",
      "address": "Av. Siempre Viva 742",
      "budget": "15000.00",
      "status": "PENDIENTE",
      "createdAt": "2026-11-05T12:00:00.000Z",
      "updatedAt": "2026-11-05T12:00:00.000Z",
      "acceptedAt": null,
      "startedAt": null,
      "completedAt": null,
      "cancelledAt": null,
      "cancellationReason": null,
      "service": { "id": "70d2dc01-cb7b-4c7e-8b93-47c46768dc65", "name": "Plomería", "slug": "plomeria" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 42, "totalPages": 3 }
}
```

Parámetros opcionales: `page` (desde 1) y `limit` (de 1 a 100). Errores: `400` para parámetros inválidos, `401` sin autenticación, `403` si el rol no es `TECNICO`, `500` ante un error inesperado.

### `POST /api/requests`

Requiere rol `CLIENTE`. El cliente se obtiene del token; el cliente no puede enviar `clientId`, `technicianId` ni `status`.

**Request**

```json
{
  "serviceId": "70d2dc01-cb7b-4c7e-8b93-47c46768dc65",
  "title": "Pérdida en la cocina",
  "description": "Gotea la canilla debajo de la mesada.",
  "address": "Av. Siempre Viva 742",
  "budget": "15000.00"
}
```

`budget` es opcional y puede omitirse o ser `null`. La solicitud nace con `status: "PENDIENTE"` y sin técnico asignado (RN-07); `serviceId` debe apuntar a un servicio activo (RN-08).

**`201 Created`** — devuelve directamente la solicitud creada con la misma forma de objeto mostrada en `GET /api/requests`; `updatedAt` inicialmente coincide con `createdAt` y los timestamps de transición son `null`.

Errores: `400` para campos inválidos, `401` sin autenticación, `403` si el rol no es `CLIENTE`, `404` si el servicio no existe o está inactivo, `500` ante un error inesperado.

### `GET /api/requests/mine`

Requiere rol `CLIENTE`. Devuelve únicamente las solicitudes del usuario autenticado, incluyendo todos sus estados.

**`200 OK`** — `{ "items": [<request>, ...], "pagination": { "page": 1, "limit": 20, "totalItems": 0, "totalPages": 0 } }`, con la misma forma de objeto de `GET /api/requests`. Una cuenta sin solicitudes recibe `items: []`.

Parámetros opcionales: `page` y `limit`; no admite filtros. Errores: `400` para parámetros inválidos, `401` sin autenticación, `403` si el rol no es `CLIENTE`, `500` ante un error inesperado.

### `PATCH /api/requests/{id}/accept`

Requiere rol `TECNICO`; no recibe body. Solo puede aceptar una solicitud `PENDIENTE`. La operación debe ser atómica: si otro técnico la tomó primero, se devuelve `409` (RN-11/RN-12). También devuelve `409` si el técnico ya alcanzó el límite de trabajos activos (RN-19/RN-20).

**`200 OK`** — devuelve el objeto completo de solicitud mostrado en `GET /api/requests`, actualizado con `status: "ACEPTADA"`, `technicianId` igual al usuario autenticado y `acceptedAt` con timestamp. `updatedAt` también se actualiza.

Errores: `401` sin autenticación, `403` si el rol no es `TECNICO`, `404` si la solicitud no existe, `409` si ya no está pendiente o se alcanzó el límite de trabajos activos, `500` ante un error inesperado.

### `PATCH /api/requests/{id}/reject`

Requiere rol `TECNICO`. `note` es opcional. El rechazo no cambia el estado global: la solicitud permanece `PENDIENTE`, sigue visible para otros técnicos y se oculta al técnico que la rechazó (RN-15).

**Request opcional**

```json
{ "note": "No tengo disponibilidad para este trabajo." }
```

**`200 OK`**

```json
{
  "requestId": "3c9b6d7a-08cb-4c3a-aa96-5ce50e59291f",
  "status": "PENDIENTE",
  "rejected": true
}
```

Errores: `401` sin autenticación, `403` si el rol no es `TECNICO`, `404` si la solicitud no existe, `409` si ya no está pendiente, `500` ante un error inesperado.

### `GET /api/admin/users`

Requiere rol `ADMIN`. Devuelve todos los usuarios, excluyendo `passwordHash`.

**`200 OK`**

```json
{
  "items": [
    {
      "id": "6dc74b7e-2218-45de-b2d5-bc887c313b18",
      "email": "ana@example.com",
      "fullName": "Ana Pérez",
      "phone": "+54 11 5555-0101",
      "role": "CLIENTE",
      "isActive": true,
      "createdAt": "2026-11-05T12:00:00.000Z",
      "updatedAt": "2026-11-05T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 }
}
```

Parámetros opcionales: `page` y `limit`; no admite filtros. Errores: `400` para parámetros inválidos, `401` sin autenticación, `403` si el rol no es `ADMIN`, `500` ante un error inesperado.

### `GET /api/admin/requests`

Requiere rol `ADMIN`. Devuelve solicitudes de todos los estados, sin filtros en la primera versión.

**`200 OK`** — `{ "items": [<request>, ...], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } }`, con el objeto completo de solicitud mostrado en `GET /api/requests`.

Parámetros opcionales: `page` y `limit`; no admite filtros. Errores: `400` para parámetros inválidos, `401` sin autenticación, `403` si el rol no es `ADMIN`, `500` ante un error inesperado.

## Decisiones y dependencias pendientes

Estas decisiones hacen el contrato concreto y quedan para que el responsable del producto las apruebe o ajuste. No bloquean el trabajo por requerir una votación del equipo:

### Decisiones confirmadas

- Rutas REST en inglés.
- Respuestas exitosas directas (sin wrapper `data`) y errores `{ "error": "mensaje" }`, como en los ejemplos del curso.
- Email normalizado con `trim` + minúsculas.
- Registro público solo para `CLIENTE` o `TECNICO` (RN-05).
- Contraseña con mínimo de 8 caracteres (Semana 3).
- Registro y login devuelven un JWT.
- Listados paginados, sin filtros.
- `budget` como decimal string.
- Persistir cada rechazo mediante una fila asociada a la pareja `requestId` + `technicianId`. Debe quedar una sola fila por pareja; el rechazo no cambia el estado global de la solicitud. Esta decisión queda tomada; falta implementar el modelo Prisma y su migración.

### Decisiones todavía propuestas

1. Defaults técnicos de paginación (`page=1`, `limit=20`, máximo 100).
2. `note` opcional al rechazar; Semana 6 lo muestra opcional. Se recomienda mantenerlo opcional.

**Dependencia de implementación:** el esquema Prisma actual contiene `User`, `Service` y `ServiceRequest`, pero todavía no incluye el registro por técnico de solicitudes rechazadas. Antes de implementar `GET /api/requests` y `PATCH .../reject`, hay que agregar el modelo y su migración.

## Correspondencia con el estado actual

- OpenAPI/Swagger documenta `GET /health` y las nueve rutas planificadas; las rutas de negocio todavía no están registradas en Express y devolverán 404 hasta que se implementen.
- El modelo Prisma usa `passwordHash` y `fullName`; el API expone `fullName` y nunca expone el hash.
- Las rutas REST se fijan en inglés (`/api/requests`, `/api/auth/register`), manteniendo los enums del dominio tal como están definidos.
- Al implementar las rutas, sus controladores deben respetar estos schemas; `/docs` y `/openapi.json` ya muestran este contrato y sus respuestas esperadas.
