# Registro de ejecución manual

Commit: `ae027bb70e`. Entorno: Ubuntu 24.04 (WSL2), Chromium, `http://localhost:3000`, interfaz en inglés.

Evidencia: ruta de la captura en `evidencias/manual/CP-xx_<AAAA-MM-DD>.png` o enlace al video en Drive (ver sección 12 del PROMPT). Cada integrante agrega filas solo en su tabla, para evitar conflictos al juntar ramas.

## Kendall (CP-01 a CP-33, CP-67 y CP-68)

| CP | Fecha | Ejecutó | Resultado | Observaciones | Evidencia | Defecto |
|---|---|---|---|---|---|---|
| CP-01 | 2026-11-18 | Kendall | Pasó | Ejecutado en una base temporal vacía. Tras crear `admin` / `admin@test.com`, se omitió la configuración inicial y se llegó al panel. La base muestra un único usuario con rol ADMIN y `/settings/admin` abre `/settings/admin/flags`. | `evidencias/manual/CP-01_admin_2026-11-18.png` | — |
| CP-03 | 2026-11-18 | Kendall | Pasó | Con `pro@example.com` se muestra el panel «Tipos de Evento». Interfaz en español. | `evidencias/manual/CP-03_2026-11-18.png` | — |
| CP-04 | 2026-11-18 | Kendall | Pasó | Sigue en el login con «El correo electrónico o la contraseña son incorrectos.» (equivalente en español del mensaje del plan). | `evidencias/manual/CP-04_2026-11-18.png` | — |
| CP-05 | 2026-11-18 | Kendall | Pasó | Con `noexiste@test.com` y la contraseña de otro usuario (`free`) aparece el mismo mensaje que en CP-04: «El correo electrónico o la contraseña son incorrectos.» | `evidencias/manual/CP-05_2026-11-18.png` | — |
| CP-06 | 2026-11-18 | Kendall | Pasó | Con `noexiste@test.com` / `xxxx` sigue en el login con «El correo electrónico o la contraseña son incorrectos.» (equivalente en español del mensaje del plan). | `evidencias/manual/CP-06_2026-11-18.png` | — |
| CP-07 | 2026-11-18 | Kendall | Pasó | Con `usuario.com` aparece «Ingresa un correo electrónico válido» y Network, filtrado por `callback`, queda vacío: no se envía la petición. | `evidencias/manual/CP-07_2026-11-18.png` | — |
| CP-08 | 2026-11-18 | Kendall | Pasó | «Este campo es requerido.» aparece a la vez bajo correo y contraseña (equivalente en español del mensaje del plan). | `evidencias/manual/CP-08_2026-11-18.png` | — |

## Gary (CP-34 a CP-66)

| CP | Fecha | Ejecutó | Resultado | Observaciones | Evidencia | Defecto |
|---|---|---|---|---|---|---|
| CP-50 | 2026-11-18 | Claude Code | Pasó | `POST /api/book/event` sin correo ni horario respondió HTTP 400 indicando `start` y `responses,email`; las reservas del evento siguieron en 4. | `evidencias/manual/CP-50_2026-11-18.json` | — |
| CP-51 | 2026-11-18 | Claude Code | Pasó | Dos `POST /api/book/event` simultáneos al 8/12/2026, 15:00: uno respondió HTTP 200 y el otro HTTP 409 (`booking_conflict_error`). Solo existe una reserva en ese horario. | `evidencias/manual/CP-51_2026-11-18.json` | — |
| CP-52 | 2026-11-18 | Claude Code | Pasó | `slots.getSchedule` con `Asia/Tokyo` respondió HTTP 200 con 32 horarios sin solapamientos. Las 9:00 de Costa Rica del 1/12 aparecen como 00:00 del 2/12 en Tokio. | `evidencias/manual/CP-52_2026-11-18.json` | — |
