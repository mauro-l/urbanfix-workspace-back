# Punto 1 — Reglas de negocio del MVP

> **Objetivo:** definir las entidades, sus atributos y las reglas de negocio del marketplace.
> **Stack:** Node.js + Express + Prisma + PostgreSQL (Neon).
> **Horizonte:** MVP de 8 semanas, acotado al flujo esencial de solicitudes de servicio.
> **Estado:** interpretación de trabajo basada en el brief y en T-04, T-06, T-08 y T-11 de la matriz QA; pendiente de validación grupal, no es un acuerdo del equipo.

---

## 1. Entidades principales

El brief nombra tres entidades: **Usuario**, **Servicio** y **Solicitud**. A esas se agregan tres de soporte: el perfil del técnico, el historial de estados y la auditoría de moderación.

### 1.1 Usuario

Representa a cualquier persona con cuenta en la plataforma. El rol define qué puede hacer.

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `id` | UUID | Sí | Clave primaria |
| `email` | String | Sí | Único. Es el identificador de login |
| `password_hash` | String | Sí | Nunca se guarda la contraseña en claro |
| `full_name` | String | Sí | Nombre visible |
| `phone` | String | No | Canal de contacto entre cliente y técnico |
| `role` | Enum | Sí | `CLIENTE` \| `TECNICO` \| `ADMIN` |
| `is_active` | Boolean | Sí | Default `true`. El admin lo pasa a `false` para suspender |
| `created_at` | Timestamp | Sí | |
| `updated_at` | Timestamp | Sí | |

**Decisión:** un usuario tiene exactamente un rol. No se modela "técnico que además es cliente" en el MVP; agrega complejidad de permisos sin aportar al alcance.

### 1.2 PerfilTecnico (extensión 1:1 de Usuario)

Solo aplica a usuarios con `role = TECNICO`. Se separa para no llenar la tabla de identidad con columnas nulas.

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `user_id` | UUID | Sí | PK y FK a `Usuario.id` |
| `bio` | Text | No | Presentación del técnico |
| `created_at` | Timestamp | Sí | |

### 1.3 Servicio (catálogo de rubros)

Es el tipo de trabajo ofrecido: electricidad, plomería, informática. Es un catálogo, no una instancia de trabajo.

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `id` | UUID | Sí | Clave primaria |
| `name` | String | Sí | Único. Ej: "Electricidad" |
| `slug` | String | Sí | Único. Para URLs y filtros |
| `description` | Text | No | Detalle del rubro |
| `is_active` | Boolean | Sí | El admin puede desactivar un rubro sin borrarlo |
| `created_at` | Timestamp | Sí | |

### 1.4 Solicitud (entidad central)

Es el trabajo concreto que un cliente publica y un técnico toma. **Todo el producto gira alrededor de esta entidad y de su estado.**

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `id` | UUID | Sí | Clave primaria |
| `client_id` | UUID | Sí | FK a `Usuario.id`. Debe tener rol `CLIENTE` |
| `technician_id` | UUID | No | FK a `Usuario.id`. Nulo hasta que alguien acepta |
| `service_id` | UUID | Sí | FK a `Servicio.id`. Debe estar activo |
| `title` | String | Sí | Resumen corto del trabajo |
| `description` | Text | Sí | Detalle del problema |
| `address` | String | Sí | El servicio es a domicilio |
| `budget` | Decimal | No | Monto estimado. Ver pregunta 3 |
| `status` | Enum | Sí | Nace en `PENDIENTE`. Ver sección 2 |
| `created_at` | Timestamp | Sí | |
| `updated_at` | Timestamp | Sí | |
| `accepted_at` | Timestamp | No | |
| `started_at` | Timestamp | No | |
| `completed_at` | Timestamp | No | |
| `cancelled_at` | Timestamp | No | |
| `cancellation_reason` | Text | No | Obligatorio si el estado es `CANCELADA` |

### 1.5 EventoSolicitud (historial)

Sin esta tabla, "seguimiento del estado" se reduce a un campo que se pisa y se pierde la trazabilidad.

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `id` | UUID | Sí | Clave primaria |
| `request_id` | UUID | Sí | FK a `Solicitud.id` |
| `actor_id` | UUID | Sí | FK a `Usuario.id`. Quién ejecutó la transición |
| `from_status` | Enum | No | Nulo en la creación |
| `to_status` | Enum | Sí | |
| `note` | Text | No | Motivo, especialmente en rechazos y cancelaciones |
| `created_at` | Timestamp | Sí | |

### 1.6 AccionAdmin (auditoría de moderación)

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `id` | UUID | Sí | Clave primaria |
| `admin_id` | UUID | Sí | FK a `Usuario.id` con rol `ADMIN` |
| `target_type` | Enum | Sí | `user` \| `request` \| `service` |
| `target_id` | UUID | Sí | Qué entidad se modificó |
| `action` | String | Sí | Ej: `suspend_user`, `force_cancel` |
| `reason` | Text | Sí | La moderación sin motivo no es auditable |
| `created_at` | Timestamp | Sí | |

---

## 2. Ciclo de vida de la Solicitud

```
  (nace) ──> PENDIENTE ──aceptar──> ACEPTADA ──iniciar──> EN_PROGRESO ──finalizar──> COMPLETADA
                 │                      │
              cancelar               cancelar
               (T-04)                 (T-06)
                 v                      v
             CANCELADA              CANCELADA
```

`COMPLETADA` es el estado final del trabajo; no hay un estado separado `CERRADA` ni una confirmación posterior del cliente. Cancelar desde `EN_PROGRESO` está bloqueado (T-08). Rechazar una solicitud no cambia su estado global.

| Estado | Significado | Quién puede salir de él |
| --- | --- | --- |
| `PENDIENTE` | Publicada, sin técnico asignado | Cliente dueño (cancelar), técnico (aceptar) |
| `ACEPTADA` | Un técnico la tomó | Cliente dueño (cancelar), técnico asignado (iniciar), admin |
| `EN_PROGRESO` | Trabajo en ejecución | Técnico asignado (finalizar), admin; cancelar está bloqueado (T-08) |
| `COMPLETADA` | Trabajo realizado. Estado final | Nadie en el flujo normal; el admin puede forzar transiciones (RN-21) |
| `CANCELADA` | Anulada | Nadie. Estado final |

**Estados "activos"** (los que consumen capacidad del técnico): `ACEPTADA` y `EN_PROGRESO`.

---

## 3. Reglas de negocio

### 3.1 Identidad y acceso

- **RN-01.** Cada usuario tiene exactamente un rol: `CLIENTE`, `TECNICO` o `ADMIN`.
- **RN-02.** El email es único en toda la plataforma, sin importar el rol.
- **RN-03.** Una cuenta con `is_active = false` no puede autenticarse ni ejecutar acciones, pero su historial se conserva.
- **RN-04.** Solo un `ADMIN` puede suspender cuentas, desactivar rubros y forzar transiciones.
- **RN-05.** El registro público solo permite crear `CLIENTE` y `TECNICO`. Un `ADMIN` no se crea por la API pública.

### 3.2 Solicitudes

- **RN-06.** Solo un usuario con rol `CLIENTE` puede crear solicitudes.
- **RN-07.** Toda solicitud nace en `PENDIENTE`, sin `technician_id` y con un evento de creación.
- **RN-08.** Solo se puede publicar contra un `Servicio` con `is_active = true`.
- **RN-09.** Un cliente puede tener varias solicitudes abiertas en simultáneo.
- **RN-10.** El cliente puede cancelar su solicitud en `PENDIENTE` o `ACEPTADA`, incluso con un técnico asignado, y sin penalización. No puede cancelarla en `EN_PROGRESO` (T-08).

### 3.3 Transiciones

- **RN-11.** Solo un usuario con rol `TECNICO` y `is_active = true` puede aceptar una solicitud `PENDIENTE`.
- **RN-12.** Aceptar y cancelar desde `PENDIENTE` son transiciones atómicas condicionadas al estado observado por cada petición. Si ocurren simultáneamente, solo una puede cambiar la fila; la que pierde recibe `409 Conflict` (T-11). Si la aceptación gana, esa cancelación concurrente falla; una petición nueva iniciada después de observar `ACEPTADA` puede seguir T-06. La operación actualiza la fila con una condición de estado, no bloquea toda la tabla.
  - Si dos técnicos intentan aceptar la misma solicitud `PENDIENTE` a la vez, solo uno puede asignarse; el otro recibe `409 Conflict`.
- **RN-13.** Solo el técnico asignado puede pasar `ACEPTADA → EN_PROGRESO` y `EN_PROGRESO → COMPLETADA`.
- **RN-14.** `COMPLETADA` es el estado final del trabajo; no requiere una transición posterior de confirmación del cliente.
- **RN-15.** Rechazar no cambia el estado global: la solicitud permanece en `PENDIENTE`, sigue disponible para otros técnicos y se oculta al técnico que la rechazó. El rechazo se registra para ese técnico y en el historial.
- **RN-16.** Toda transición válida genera un `EventoSolicitud` con actor, estado origen y estado destino.
- **RN-17.** Un conflicto por una transición concurrente devuelve `409 Conflict` (T-11). La cancelación bloqueada desde `EN_PROGRESO` devuelve `400 Bad Request`, según T-08.
- **RN-18.** Una transición ejecutada por un rol sin permiso devuelve `403 Forbidden`.

### 3.4 Capacidad del técnico

- **RN-19.** Un técnico puede tener varios trabajos activos, con un límite configurable (default: 3).
- **RN-20.** Al alcanzar el límite, aceptar una nueva solicitud devuelve `409 Conflict` con motivo explícito.

### 3.5 Moderación

- **RN-21.** Un admin puede forzar cualquier transición de estado, incluso desde un estado final.
- **RN-22.** Toda acción de admin se registra en `AccionAdmin` con motivo obligatorio.
- **RN-23.** Suspender un usuario no cancela automáticamente sus solicitudes activas; el admin decide caso por caso.

### 3.6 Alcance de trabajo

- **RN-24.** El registro como técnico no requiere verificación de identidad, antecedentes ni acreditación de oficio. Cualquier usuario puede registrarse con ese rol.
- **RN-25.** El presupuesto es opcional. Si el cliente no lo informa, la solicitud se considera "a convenir".
- **RN-26.** No existe contraoferta ni negociación de precio. El técnico acepta el monto informado o rechaza la solicitud.
- **RN-27.** No existe segmentación ni filtrado geográfico por zona. El listado de solicitudes disponibles no se filtra por ubicación del técnico.
- **RN-28.** Al cancelar una solicitud `ACEPTADA` (T-06), se guarda en la misma transacción una notificación interna en la base para el técnico asignado. La matriz no especifica un endpoint para consultarla, una interfaz, ni envío por email, push o SMS; no se infiere ese alcance.
- **RN-29.** El MVP no incluye calificaciones ni reputación de técnicos.

---

## 4. Decisiones sobre las preguntas clave del brief

### P1. ¿Puede un técnico tener múltiples trabajos activos?

**Decisión: sí, con límite configurable (default 3).**

Razonamiento: un técnico independiente trabaja en serie, pero bloquearlo a un solo trabajo en el MVP genera fricción innecesaria y un caso borde peor (¿qué pasa si acepta y no puede ir?). El límite evita el absurdo de un técnico aceptando veinte solicitudes para "reservarlas". El valor queda en configuración para poder ajustarlo sin tocar código.

Alternativa descartada: un solo trabajo activo. Es más simple de implementar pero irreal para el dominio.

### P2. ¿Qué pasa si nadie acepta una solicitud?

**Decisión: se queda en `PENDIENTE` indefinidamente; el cliente puede cancelarla o el admin puede cancelarla por moderación.**

Razonamiento: la expiración automática requiere un proceso programado (cron o job), y el brief no menciona infraestructura de background jobs. Agregarlo en esta etapa sería resolver un problema que todavía no existe.

**Deuda declarada:** expiración automática por antigüedad y notificación al cliente. Se documenta como mejora futura.

### P3. ¿Quién define el precio?

**Decisión: el cliente indica un presupuesto estimado opcional; el técnico acepta ese monto tal cual.**

Razonamiento: el brief menciona "presupuestos claros" pero no describe negociación ni cotizaciones. Modelar una negociación multi-ronda duplica el alcance. Con un monto estimado —o "a convenir" si se omite— el técnico sabe a qué se compromete antes de aceptar.

### P4. ¿Qué pasa si un técnico acepta y luego abandona el trabajo?

**Decisión: el admin puede forzar la cancelación o reasignar manualmente. No hay auto-liberación.**

Razonamiento: requiere un mecanismo de detección de inactividad que excede el MVP. El admin como red de contención es suficiente y queda auditado.

---

## 5. Decisiones de alcance y limitaciones asumidas

| Decisión | Consecuencia |
| --- | --- |
| Un rol por cuenta | Si un técnico también necesita contratar, requiere otra cuenta o un cambio en el modelo de permisos |
| Sin verificación de técnicos (RN-24) | La promesa de "confiabilidad" se apoya solo en el historial de trabajos, no en validación de identidad u oficio |
| Sin calificaciones ni reputación (RN-29) | Queda como evolución natural del producto |
| Sin segmentación geográfica (RN-27) | El técnico ve todas las solicitudes de su rubro, sin importar la distancia |
| Notificación interna de T-06 (RN-28) | Se persiste el aviso para el técnico; la matriz no define cómo se consulta o se muestra |
| Sin expiración automática de `PENDIENTE` | Solicitudes antiguas se acumulan en el pool hasta que el cliente o el admin las cancelen |
| Cancelación limitada a `PENDIENTE` y `ACEPTADA` (RN-10) | La cancelación en `EN_PROGRESO` está bloqueada; T-08 indica contactar a soporte |
