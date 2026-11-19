# Registro de defectos

Commit probado: `ae027bb70e`. Numeración para no chocar al juntar ramas: **Kendall DEF-01 a DEF-49, Gary DEF-50 a DEF-99**. La columna «Código QAtlas» se llena al pasar el defecto a QAtlas.

## Resumen

| ID | Código QAtlas | CP | Título | Severidad | Prioridad | Estado | Reportó |
|---|---|---|---|---|---|---|---|
| DEF-01 | CL-BUG-3 | CP-29 | Una reserva cancelada puede confirmarse mediante `bookings.confirm` | Alta | Media | Abierto | Kendall |
| DEF-02 | Pendiente | CP-11 | El perfil ofrece actualizar a un nombre de usuario que ya existe | Media | Media | Abierto | Claude Code |
| DEF-03 | Pendiente | CP-51 | La reserva simultánea rechazada responde HTTP 400 en lugar de 409 | Media | Media | Abierto | Claude Code |
| DEF-04 | CL-BUG-5 | CP-54 | Consultar la reserva de otro usuario responde HTTP 500 en lugar de 403 o 404 | Media | Media | Abierto | Gary / Claude Code |
| DEF-05 | Pendiente | CP-60 | Error intermitente de React #419 al cargar el perfil | Baja | Baja | Abierto | Claude Code |

## Detalle

### DEF-01: Una reserva cancelada puede confirmarse

- **Código QAtlas:** CL-BUG-3
- **CP relacionado:** CP-29
- **Severidad / prioridad:** alta / media
- **Precondiciones:** anfitrión autenticado y reserva en estado `CANCELLED`.
- **Pasos para reproducir:**
  1. Enviar `POST /api/trpc/bookings/confirm?batch=1` con el id de la reserva y `confirmed: true`.
  2. Consultar el estado de la reserva.
- **Resultado esperado:** acción rechazada; el estado sigue en `CANCELLED`.
- **Resultado obtenido:** la reserva pasa a `ACCEPTED`.
- **Evidencia:** `evidencias/2026-11-18/results.xml`, prueba «CP-29 no permite confirmar una reserva cancelada».
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, build de producción, http://localhost:3000

### DEF-02: El perfil acepta iniciar el cambio a un usuario existente

- **Código QAtlas:** pendiente
- **CP relacionado:** CP-11
- **Severidad / prioridad:** media / media
- **Precondiciones:** existen dos usuarios y el primero tiene sesión iniciada.
- **Pasos para reproducir:**
  1. Abrir `/settings/my-account/profile`.
  2. Escribir en Username el nombre del segundo usuario y esperar la validación.
- **Resultado esperado:** aparece «Username is already taken» y no se ofrece «Update».
- **Resultado obtenido:** no aparece el mensaje y se ofrece «Update». `POST /api/username` responde `available: true`.
- **Evidencia:** `evidencias/2026-11-18/results.xml`, pruebas «CP-11».
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, build de producción, http://localhost:3000

### DEF-03: El conflicto de reservas simultáneas no responde HTTP 409

- **Código QAtlas:** pendiente
- **CP relacionado:** CP-51
- **Severidad / prioridad:** media / media
- **Precondiciones:** evento con un horario libre.
- **Pasos para reproducir:**
  1. Enviar a la vez dos `POST /api/book/event` idénticos para ese horario.
- **Resultado esperado:** una petición responde 200 y la otra 409.
- **Resultado obtenido:** en el build de producción, una responde 200 y la otra 400 con «An error occurred while querying the database.». Solo se crea una reserva. En modo desarrollo se obtuvo 409.
- **Evidencia:** `evidencias/2026-11-18/results.xml`, prueba «CP-51 acepta una reserva y rechaza la otra con HTTP 409».
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, build de producción, http://localhost:3000

### DEF-04: Acceso a una reserva ajena responde con error del servidor

- **Código QAtlas:** CL-BUG-5
- **CP relacionado:** CP-54
- **Severidad / prioridad:** media / media (CL-BUG-5 está registrado como alta / alta y describe una exposición de datos que falta confirmar)
- **Precondiciones:** el usuario B tiene una reserva y el usuario A tiene sesión iniciada.
- **Pasos para reproducir:**
  1. Con la sesión de A, consultar `bookings/getBookingDetails` con el uid de la reserva de B.
- **Resultado esperado:** HTTP 403 o 404, sin datos de B.
- **Resultado obtenido:** HTTP 500 con mensaje de permisos. La prueba automatizada confirma que esta ruta no devuelve el correo del invitado.
- **Evidencia:** `evidencias/2026-11-18/results.xml`, pruebas «CP-54».
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, build de producción, http://localhost:3000

### DEF-05: Error intermitente de React al cargar el perfil

- **Código QAtlas:** pendiente
- **CP relacionado:** CP-60
- **Severidad / prioridad:** baja / baja
- **Precondiciones:** usuario con sesión iniciada y suite en paralelo.
- **Pasos para reproducir:**
  1. Abrir `/settings/my-account/profile` con la consola abierta.
- **Resultado esperado:** la página carga sin errores de consola.
- **Resultado obtenido:** en algunas corridas aparece «Minified React error #419». No ocurre siempre.
- **Evidencia:** `evidencias/2026-11-18/results.xml`, prueba «CP-60 /settings/my-account/profile».
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, build de producción, http://localhost:3000

<!-- Plantilla: copiar por cada defecto.

### DEF-xx: <título>

- **Código QAtlas:**
- **CP relacionado:**
- **Severidad / prioridad:** <crítica | alta | media | baja> / <alta | media | baja>
- **Precondiciones:**
- **Pasos para reproducir:**
  1.
- **Resultado esperado:**
- **Resultado obtenido:**
- **Evidencia:** <ruta del trace o la captura>
- **Commit y entorno:** ae027bb70e · Ubuntu 24.04 (WSL2), Chromium, http://localhost:3000
-->
