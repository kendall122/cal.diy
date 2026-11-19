# Contexto e instrucciones: proyecto de pruebas automatizadas de cal.diy

Eres mi asistente para la **fase 3 (Diseño, desarrollo y evaluación)** del proyecto del curso *Aseguramiento de la Calidad de Software* (TEC, grupo 50). Equipo: Kendall Ramírez Montero y Gary Caldera González. Trabajamos en español. Lee este documento completo antes de hacer cualquier cosa y vuelve a él cuando tengas dudas.

## 1. Qué estamos haciendo

- Probamos **cal.diy** (fork comunitario y MIT de Cal.com, sin módulos empresariales) en una instancia local.
- En la fase 2 hicimos un plan de pruebas con **68 casos** (CP-01 a CP-68) sobre 16 historias de usuario (US-01 a US-16). Los casos ya están registrados en **QAtlas**.
- En esta fase hay que **automatizar con Playwright al menos el 90 % de los casos** (62 automatizados y 6 manuales: CP-63 a CP-68), ejecutarlos, guardar evidencias y documentar resultados y defectos.
- **No estamos desarrollando cal.diy**: estamos probándolo. Nuestro trabajo es escribir pruebas, no corregir la aplicación.

### Rúbrica del "Proyecto de pruebas" (100 pts). Todo el código debe cumplirla

| Criterio | Pts | Cómo se cumple |
|---|---|---|
| Al menos el 90 % de los casos automatizados | 20 | Los 62 casos automatizados del plan. No hay margen: si un caso no se puede automatizar, avísame de inmediato. |
| Los proyectos de pruebas funcionan correctamente | 20 | Las pruebas corren sin errores de código ni dependencias rotas. |
| Las pruebas corresponden al plan de pruebas | 15 | Cada prueba implementa su CP tal como está en la tabla de la sección 7. |
| **Cada método de prueba tiene un único `expect`** | 10 | Un solo `expect` por `test()`. Si un caso verifica varias cosas, se divide en varias pruebas o se parametriza (ver sección 6). |
| Nombra correctamente los métodos de prueba | 10 | El título de cada prueba empieza con su CP: `test("CP-04 rechaza una contraseña incorrecta", ...)`. |
| Usa métodos pre/post eficientemente | 10 | `test.beforeEach` / `afterEach` / `beforeAll` / `afterAll` para preparar y limpiar (iniciar sesión, crear y borrar datos). |
| Todas las pruebas se ejecutan de forma simultánea | 10 | `test.describe.configure({ mode: "parallel" })` y datos aislados por prueba. La configuración del repositorio ya usa `fullyParallel: true`. |
| Usa pruebas parametrizadas adecuadamente | 5 | `for (const dato of datos) { test(\`CP-xx ... ${dato.nombre}\`, ...) }` para clases de equivalencia y valores límite. |

## 2. Fase 0: revisar el entorno (hazlo primero y no instales nada sin preguntarme)

Ejecuta estas verificaciones y entrégame **una tabla con: herramienta, versión encontrada, versión requerida y estado (OK / falta / revisar)**. Si algo falta o no cumple, explícame cómo instalarlo y **espera mi confirmación**.

1. **Sistema operativo**: detecta si es Windows, WSL2, macOS o Linux. En Windows se recomienda **trabajar dentro de WSL2** (Ubuntu), porque el repositorio usa enlaces simbólicos. Si estoy en Windows nativo, avísame y propón la alternativa. La guía de instalación en WSL2 está en la **sección 10**.
   - Windows: `wsl -l -v` debe mostrar una distribución con VERSION 2.
2. **Git**: `git --version`. En Windows nativo también hace falta `git config core.symlinks` con valor `true`.
3. **Node.js**: `node -v`, versión **18 o superior** (recomendado 20 o 22 LTS). Si existe `nvm`, `nvm -v`.
4. **Yarn 4**: `corepack --version` y `yarn -v`. El `package.json` exige `yarn >= 4.12.0`. Si falta: `corepack enable`.
5. **Docker**: `docker --version`, `docker compose version` y `docker info` (el demonio debe estar **corriendo**; en Windows y Mac, Docker Desktop abierto).
6. **OpenSSL**: `openssl version` (para generar secretos).
7. **Recursos**: RAM total y libre (`free -h`, o equivalente) y espacio en disco (`df -h .`). Se necesitan **al menos 20 GB libres**; con 16 GB de RAM o menos hay que subir la memoria de Node (ver sección 3).
8. **Puertos libres**: 3000 (app), 5450 (Postgres de Docker), 5555 (Prisma Studio), 1025 y 8025 (MailHog, opcional). Por ejemplo `lsof -i :3000` o `ss -ltnp | grep 3000`.
9. **Repositorio**: en la carpeta del proyecto, `git remote -v`, `git branch --show-current` y `git log -1 --oneline`. Confírmame **el hash del commit** que vamos a probar; va en la ficha del entorno (meta M4.1).
10. **Playwright**: después de `yarn`, comprueba `yarn playwright --version` (el repositorio fija `@playwright/test` 1.57.0) y si Chromium está instalado.

## 3. Puesta en marcha de cal.diy (guíame paso a paso y verifica cada uno)

```bash
# 1. Clonar el fork del equipo (kendall122/cal.diy; ver sección 10 para WSL) y crear tu rama
#    desde la rama compartida `proyecto-qa`, que ya existe en origin:
git fetch origin
git checkout -b qa-gary origin/proyecto-qa   # o qa-kendall

# 2. Dependencias
yarn

# 3. Variables de entorno
cp .env.example .env
#   NEXTAUTH_SECRET=<salida de: openssl rand -base64 32>
#   CALENDSO_ENCRYPTION_KEY=<salida de: openssl rand -base64 24>
#   NEXT_PUBLIC_WEBAPP_URL='http://localhost:3000'   (ya viene así)
#   NEXTAUTH_URL='http://localhost:3000'             (ya viene así)
#   NEXT_PUBLIC_IS_E2E=1                             <- IMPORTANTE, ver nota abajo
# Solo en Windows sin WSL: rm packages/prisma/.env && cp .env packages/prisma/.env

# 4. Base de datos (Postgres 18 en Docker, puerto 5450) + migraciones + datos semilla
#    Ojo: al terminar, `yarn dx` también deja corriendo el servidor de desarrollo en el puerto 3000.
#    Si ya está corriendo, no hace falta el paso 5 (y `yarn dev` chocaría por el puerto).
yarn dx

# 5. Levantar la app (solo si no la dejó corriendo `yarn dx`)
export NODE_OPTIONS="--max-old-space-size=6144"   # 6144 en WSL con 12 GB; 8192 si hay más RAM libre
yarn dev                                           # http://localhost:3000
```

- El seed muestra `Error adding google credentials to DB: Unexpected end of JSON input` si `GOOGLE_API_CREDENTIALS` está vacío. Es esperado; solo importa para CP-49.

- **Usuarios semilla** que crea `yarn dx`: `free@example.com` / `free`, `pro@example.com` / `pro`, `trial@example.com` / `trial`, `admin@example.com` / `ADMINadmin2022!`, `onboarding@example.com` / `onboarding`. Verifica que se pueda iniciar sesión con `pro@example.com` antes de seguir.
- **¿Por qué `NEXT_PUBLIC_IS_E2E=1`?**
  - **Webhooks:** la protección SSRF (`packages/lib/ssrfProtection.ts`) solo acepta URLs de webhook hacia `localhost` o `127.0.0.1` cuando esa variable vale `1`. Sin ella, CP-47 y CP-55 a CP-58 fallan.
  - **Administrador:** en modo producción, un administrador sin 2FA queda inactivo, lo que afecta a CP-01.
  - **Scripts del repositorio:** `yarn e2e` la define automáticamente, pero `yarn dev` no.
- **Servidor durante las pruebas:** `playwright.config.ts` define un `webServer` que ejecuta `yarn workspace @calcom/web start -p 3000`, lo cual requiere `yarn build`. Como tiene `reuseExistingServer: !process.env.CI`, **si `yarn dev` ya está corriendo en el puerto 3000, Playwright lo reutiliza**. Para desarrollar las pruebas usa `yarn dev`. Para la ejecución final, si la máquina lo soporta, usa `yarn build` y deja que Playwright levante el servidor.
- **Prueba de humo:** antes de escribir nada, ejecuta una prueba existente del repositorio para confirmar que todo funciona:
  ```bash
  npx playwright install chromium
  PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/change-username.e2e.ts
  ```
  - Resultado esperado: **2 aprobadas y 1 omitida**. La omitida («PREMIUM username») la salta el propio repositorio porque no hay Stripe y la instancia es autoalojada.
  - Si falla con `libnspr4.so: cannot open shared object file`, faltan bibliotecas del sistema. Instálalas (pide contraseña de `sudo`) usando rutas absolutas, porque dentro de `sudo` no se carga nvm y `npx` termina en el Node de Windows:
    ```bash
    cd ~/cal.diy && sudo "$(nvm which default)" ./node_modules/playwright/cli.js install-deps chromium
    ```

## 4. Lo que hay que saber del repositorio

- **Configuración:** `playwright.config.ts` en la raíz del repositorio.
  - Proyecto `@calcom/web`, `testDir: ./apps/web/playwright`, `testMatch: /.*\.e2e\.tsx?/`. **Solo se ejecutan archivos `*.e2e.ts`**.
  - `fullyParallel: true`, `workers` igual al número de CPU, `locale: "en-US"` (**la interfaz está en inglés durante las pruebas**) y `baseURL` tomado de `NEXT_PUBLIC_WEBAPP_URL`.
  - Tiempos máximos locales: 240 s por prueba y 120 s por `expect`.
  - Reportes: `list`, HTML en `test-results/reports/playwright-html-report` y JUnit en `test-results/reports/results.xml`. **El JUnit lo usaremos para las métricas del informe.**
- **Fixtures** (`apps/web/playwright/lib/fixtures.ts`): importa `test` desde ahí, no desde `@playwright/test`. Los más útiles:
  - **`users`**: `users.create(opts?)` crea un usuario con usuario y correo únicos (por omisión `<usuario>@example.com`; la contraseña por omisión es el usuario con la primera letra en mayúscula y un `1` al final, disponible con `getDefaultPassword(username)` de `apps/web/playwright/lib/testUtils.ts`). `user.login()` inicia sesión y `users.deleteAll()` limpia, ideal en `afterEach`.
  - **`bookings`, `prisma`, `emails`, `webhooks`, `servers`, `bookingPage`, `eventTypePage`**: revisa `apps/web/playwright/fixtures/*.ts` antes de usarlos.
- **Textos de la interfaz:** usa `localize("en")` de `apps/web/playwright/lib/localize.ts` o los textos en inglés de `packages/i18n/locales/en/common.json`. **Prefiere `data-testid` cuando exista**. Por ejemplo, en el login: `[data-testid=login-form]`, `#email` y `[data-testid=field-error]`; en el menú: `[data-testid=user-dropdown-trigger-button]:visible` y `[data-testid=logout-btn]`.
- **Pruebas parecidas del repositorio** que sirven de modelo:
  - `login.e2e.ts`, `change-username.e2e.ts`, `profile.e2e.ts`, `event-types.e2e.ts`, `availability.e2e.ts`
  - `booking-limits.e2e.ts`, `booking-confirm-reject.e2e.ts`, `reschedule.e2e.ts`, `webhook.e2e.ts`
  - `settings-admin.e2e.ts`, `login.api.e2e.ts`
  - Léelas para copiar patrones (creación de datos, selectores, esperas), **no para copiarlas tal cual**.
- **`CLAUDE.md` del repositorio:** está pensado para quienes contribuyen a cal.diy. Aplican sus reglas de TypeScript (sin `as any`, `import type`), **pero no vamos a hacer PR al proyecto original**.

## 5. Reglas de trabajo para ti

1. **Solo crea o modifica archivos dentro de `apps/web/playwright/proyecto-qa/`.** No toques el código de la aplicación (`apps/web` fuera de esa carpeta, `packages/`), `playwright.config.ts`, el esquema de Prisma ni las dependencias. Si crees que algo de eso hace falta, explícame por qué y pregúntame antes.
2. **Nunca ajustes una prueba para que "pase" si el sistema se comporta distinto a lo esperado en el plan.**
   - Si falla por un error en la prueba (selector, espera, datos), corrígela.
   - Si falla porque **la aplicación** no cumple el resultado esperado, es un **posible defecto**: deja la prueba con el resultado esperado del plan, documenta el defecto (regla 8) y avísame.
3. **Antes de escribir selectores o rutas, verifícalos en el código fuente** (componentes en `apps/web/modules`, `packages/features`, rutas en `apps/web/app`). Los datos de la sección 7 se verificaron contra los commits `54343aa` y `ae027bb`, pero el commit fijado puede ser otro.
4. **Trabaja un archivo a la vez.** Escríbelo, ejecútalo en modo headless (`PLAYWRIGHT_HEADLESS=1 yarn e2e <ruta> --workers=6`), muéstrame el resultado y espera mi visto bueno antes de seguir.
5. **Cada prueba crea sus propios datos** con los fixtures y los limpia en `afterEach`, para poder correr en paralelo. No dependas de los usuarios semilla ni del orden de ejecución.
6. **Prohibido** `test.skip`, `test.only`, `waitForTimeout` con tiempos fijos (usa esperas de Playwright como `expect(...).toBeVisible()`, `waitForURL` o `waitForResponse`) y `as any`. Si un caso no se puede automatizar, avísame en vez de saltarlo.
7. **Comentarios y nombres de prueba en español**; el código en inglés técnico normal. Comenta solo el "por qué" cuando no sea obvio.
8. **Defectos:** cuando encuentres uno, agrégalo a `apps/web/playwright/proyecto-qa/DEFECTOS.md` con estos campos:
   - ID (DEF-xx; para no chocar al juntar ramas, **Kendall usa DEF-01 a DEF-49 y Gary DEF-50 a DEF-99**), CP relacionado, título, severidad (crítica, alta, media, baja) y prioridad
   - Precondiciones, pasos para reproducir, resultado esperado y resultado obtenido
   - Evidencia (ruta del trace o la captura), commit y entorno
   - Código QAtlas (columna del resumen; se llena cuando el defecto se pasa a QAtlas)
   Luego yo lo paso a QAtlas. El archivo ya trae la tabla de resumen y una plantilla de detalle.
9. **Commits** en la rama de cada integrante (`qa-kendall` o `qa-gary`), que se junta a `proyecto-qa` al terminar cada archivo. Mensajes tipo `test(auth): CP-03 a CP-08 inicio de sesión`. **Nunca subas `.env`** ni secretos.
10. Si algo de este documento contradice lo que ves en el código, **dímelo**. No improvises en silencio.
11. **Primero manual, después automatizado.** Todo caso se ejecuta **una vez a mano** antes de automatizarlo (salvo CP-63 a CP-68, que son solo manuales). Antes de escribir el código de un archivo:
    1. Dame un **guion de ejecución manual** de sus casos: pasos numerados, datos de prueba y resultado esperado, con los textos y rutas reales de la interfaz en inglés.
    2. Espera a que yo lo ejecute y te reporte, por cada caso, si **pasó** o **falló**, qué vi realmente y, si hace falta, capturas o selectores.
    3. Con eso:
       - Si el caso **pasó**, automatízalo.
       - Si **falló por un problema de la aplicación**, primero registra el defecto en `DEFECTOS.md` y después automatiza la prueba con el resultado esperado del plan. Esa prueba fallará, y es correcto.
       - Si **falló porque el plan describe mal la interfaz** (un texto, una ruta o un paso), dímelo para corregir el caso en QAtlas antes de automatizar.
    4. Lleva un registro en `apps/web/playwright/proyecto-qa/EJECUCION_MANUAL.md` con columnas: CP, fecha, quién ejecutó, resultado (Pasó / Falló / Bloqueado), observaciones, evidencia y defecto relacionado (ver sección 12). Cada integrante agrega filas solo en su propia tabla del archivo, para evitar conflictos al juntar ramas. Ese registro es evidencia para el informe.

## 6. Estructura y convenciones del proyecto de pruebas

**El Id de automatización en QAtlas es `<archivo>#CP-xx`, relativo a `proyecto-qa/`** (por ejemplo `auth/login.e2e.ts#CP-03`). Respeta exactamente estos nombres de archivo:

```
apps/web/playwright/proyecto-qa/
  auth/registro.e2e.ts             CP-01, CP-02
  auth/login.e2e.ts                CP-03 a CP-08
  auth/logout.e2e.ts               CP-09
  perfil/perfil.e2e.ts             CP-10 a CP-12
  event-types/event-type.e2e.ts    CP-13 a CP-17
  disponibilidad/availability.e2e.ts  CP-18 a CP-21
  disponibilidad/buffer.e2e.ts     CP-22 a CP-24
  reservas/confirmacion.e2e.ts     CP-25 a CP-29
  reservas/ventana-reserva.e2e.ts  CP-30 a CP-33
  reservas/booking-form.e2e.ts     CP-34 a CP-36
  reservas/zonas-horarias.e2e.ts   CP-37, CP-38
  reservas/cancelacion.e2e.ts      CP-39 a CP-41
  reservas/reprogramacion.e2e.ts   CP-42, CP-43
  panel/bookings.e2e.ts            CP-44 a CP-46
  webhooks/webhooks.e2e.ts         CP-47, CP-48
  api/oauth.api.e2e.ts             CP-49
  api/bookings.api.e2e.ts          CP-50, CP-51
  api/slots.api.e2e.ts             CP-52
  api/acceso.api.e2e.ts            CP-53, CP-54
  api/webhooks.api.e2e.ts          CP-55 a CP-58
  regresion/fork.e2e.ts            CP-59 a CP-61
  regresion/smoke.e2e.ts           CP-62
  lib/                             utilidades propias (helpers, datos de prueba)
  DEFECTOS.md
  README.md                        cómo ejecutar la suite y qué cubre
```

**Plantilla base de cada archivo:**

```ts
import { expect } from "@playwright/test";

import { test } from "../../lib/fixtures";

test.describe.configure({ mode: "parallel" });

test.describe("US-02 Inicio de sesión", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  test("CP-04 rechaza una contraseña incorrecta", async ({ page, users }) => {
    const user = await users.create();
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("Incorrecta#1");
    await page.locator("[data-testid=login-form] button[type=submit]").click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  });
});
```

**Un solo `expect` por prueba.** Estos casos verifican más de una cosa y deben dividirse o parametrizarse. Mantén siempre el CP al inicio del título, por ejemplo `CP-22 slot 9:30 bloqueado` y `CP-22 slot 10:30 bloqueado`:
- **CP-02:** error de correo; error de contraseña; no se crea la cuenta.
- **CP-08:** correo obligatorio; contraseña obligatoria.
- **CP-10:** nombre; nombre de usuario; zona horaria.
- **CP-12:** vacío no se guarda; `us er@#` se normaliza a `us-er`.
- **CP-20:** 16:30 se ofrece; 17:00 no se ofrece. Va parametrizado.
- **CP-22:** 9:30 y 10:30 bloqueados; 9:00 y 11:00 disponibles. Va parametrizado.
- **CP-28, CP-39 y CP-42:** el cambio de estado y la liberación del horario, en pruebas separadas.
- **CP-45:** un filtro por prueba (Unconfirmed, Past y Canceled). Va parametrizado.

**Buenos candidatos para pruebas parametrizadas:**
- CE de inicio de sesión (CP-04 a CP-08)
- Duraciones límite (CP-14 y CP-15)
- Ventana de reserva (CP-30 a CP-33)
- Rutas empresariales removidas (CP-59)
- Eventos de webhook (CP-55 a CP-57)

**Casos que necesitan preparación especial:**
- **CP-01 y CP-02 (base de datos vacía):** estrategia aprobada: un comando aparte levanta una base temporal vacía en otro puerto, inicia la app contra ella, corre `auth/registro.e2e.ts` en serie y restaura la app normal. No borres la base de datos principal.
- **CP-49 (OAuth de Google):** estrategia aprobada: la prueba coloca claves falsas en la app `google-calendar`, llama a `/api/integrations/googlecalendar/add`, verifica `client_id` y `scope` en la URL devuelta y restaura las claves. No contacta a Google.
- **CP-11 (usuario duplicado):** se automatiza con el criterio del caso en QAtlas: error de unicidad al guardar y nombre sin cambios.
- **CP-55 a CP-58 (webhooks):** usa el fixture `webhooks` o `servers` como receptor y `NEXT_PUBLIC_IS_E2E=1`.
- **CP-30 a CP-33 (ventana de reserva):** los horarios los calcula **el servidor** con su propia hora. **No uses `page.clock`.** Calcula los límites a partir de la hora real.
- **CP-63 a CP-68 son manuales:** no se automatizan. Se ejecutan con las listas de chequeo y se registran en QAtlas.

## 7. Los 68 casos de prueba (del plan entregado) con notas verificadas en el código

V = dato válido, I = dato inválido. Técnicas: CE (clases de equivalencia), VL (valores límite), TD (tabla de decisión) y DE (diagrama de estados).

| CP | HU | Archivo | Técnica | Escenario | Datos de entrada | Resultado esperado | Notas verificadas |
|---|---|---|---|---|---|---|---|
| CP-01 | US-01 | `auth/registro.e2e.ts` | CE-V3 | Registro del primer usuario en instancia nueva | Correo admin@test.com (V), contraseña robusta (V) | Cuenta creada con rol admin y acceso al panel | Ruta `/auth/setup` (la raíz redirige ahí si no hay usuarios). Paso «Administrator user»: Username, Full name (mín. 3 caracteres), Email, Password (**mín. 15 caracteres, con mayúscula, minúscula y número**), botón «Next step». Verificar el rol ADMIN abriendo `/settings/admin`. Requiere base de datos vacía y `NEXT_PUBLIC_IS_E2E=1`. |
| CP-02 | US-01 | `auth/registro.e2e.ts` | CE-I1, CE-I6 | Registro con datos inválidos | Correo admin.test.com (I); contraseña 123 (I) | Mensajes de error; no se crea la cuenta | Mensaje de correo: «Please enter a valid email». Dividir en: error de correo, error de contraseña y que no se crea la cuenta. |
| CP-03 | US-02 | `auth/login.e2e.ts` | TD R1 | Inicio de sesión válido | Correo registrado (V), contraseña correcta (V) | Acceso al panel de control | `/auth/login`, campo `#email`, botón submit con texto «Continue» (no «Sign in»). Tras iniciar sesión redirige a `/event-types`. |
| CP-04 | US-02 | `auth/login.e2e.ts` | TD R2, CE-I4 | Contraseña incorrecta | Correo registrado (V), contraseña errónea (I) | Error genérico; sin sesión | Mensaje: «Email or password is incorrect.» |
| CP-05 | US-02 | `auth/login.e2e.ts` | TD R3, CE-I3 | Correo no registrado con contraseña de otro usuario | noexiste@test.com (I), contraseña existente | Mismo mensaje de error que CP-04 (no revela si el correo existe) | Debe mostrar exactamente el mismo mensaje que CP-04, para no revelar si el correo existe. |
| CP-06 | US-02 | `auth/login.e2e.ts` | TD R4 | Correo no registrado y contraseña errónea | noexiste@test.com (I), xxxx (I) | Error genérico; sin sesión | Mismo mensaje genérico. |
| CP-07 | US-02 | `auth/login.e2e.ts` | CE-I1 | Correo con formato inválido | usuario.com (I) | Validación de formato; no se envía | Validación del cliente: «Please enter a valid email» en `[data-testid=field-error]`; no se envía la petición. |
| CP-08 | US-02 | `auth/login.e2e.ts` | CE-I2, CE-I5 | Campos vacíos | Correo y contraseña vacíos (I) | Mensajes de campo obligatorio | «This field is required.» Dividir en correo vacío y contraseña vacía. |
| CP-09 | US-02 | `auth/logout.e2e.ts` | CE | Cerrar sesión y acceder a ruta protegida | Sesión activa → cerrar sesión → abrir /event-types | Sesión cerrada; redirige al login | `[data-testid=user-dropdown-trigger-button]:visible` → «Sign out» → `[data-testid=logout-btn]`. Luego, `goto("/event-types")` debe terminar en `/auth/login`. |
| CP-10 | US-03 | `perfil/perfil.e2e.ts` | CE-V4 | Modificar y guardar perfil | Nombre (V), usuario único (V), zona America/Costa_Rica (V) | Datos guardados y visibles tras recargar | `/settings/my-account/profile`: «Update» → «Profile updated successfully». El usuario se cambia con «Update» junto al campo y «Save» en el diálogo. La zona horaria está en `/settings/my-account/general` → «Settings updated successfully». Dividir en tres pruebas. |
| CP-11 | US-03 | `perfil/perfil.e2e.ts` | CE-I7 | Usuario duplicado | Nombre de usuario ya existente (I) | Error de unicidad; no se guarda | Criterio acordado: al intentar guardar aparece «Error updating settings» y el nombre original se conserva. La pantalla ofrece «Update» y no muestra «Username is already taken»; se documenta como observación de usabilidad. |
| CP-12 | US-03 | `perfil/perfil.e2e.ts` | CE-I8 | Usuario vacío o con caracteres inválidos | "" y "us er@#" (I) | Vacío: no se puede guardar. «us er@#» se normaliza a «us-er»; nunca se guarda con caracteres no permitidos | Verificado en el código: el valor se normaliza con slugify (`us er@#` → `us-er`), no da error. Vacío: no se puede guardar. |
| CP-13 | US-05 | `event-types/event-type.e2e.ts` | CE | Crear tipo de evento | Título "Reunión 30 min" (V), duración 30 (V) | Evento en la lista con su página de reserva | `/event-types` → «New» → Title, URL (slug), Duration → «Continue». Luego abrir `/{username}/{slug}`. |
| CP-14 | US-05 | `event-types/event-type.e2e.ts` | VL | Duración por debajo del mínimo | Duración 0 (I) | Error; no se crea | Rango permitido: 1 a 1440 min. Mensaje: «Duration must be at least 1 minute(s)». |
| CP-15 | US-05 | `event-types/event-type.e2e.ts` | VL | Duración en el mínimo | Duración 1 (V) | Evento creado correctamente | Duración 1 debe crearse sin error. |
| CP-16 | US-05 | `event-types/event-type.e2e.ts` | CE | Título vacío | Título "" (I) | Mensaje de campo obligatorio | — |
| CP-17 | US-05 | `event-types/event-type.e2e.ts` | CE | Slug duplicado | Slug de otro evento (I) | Error de duplicado | El servidor responde «URL Slug already exists for given user.» |
| CP-18 | US-06 | `disponibilidad/availability.e2e.ts` | CE | Reservar dentro de la disponibilidad | Disponible martes y jueves 9:00-17:00; reservar martes 10:00 (V) | Reserva creada | — |
| CP-19 | US-06 | `disponibilidad/availability.e2e.ts` | CE | Día no configurado | Consultar un lunes (I) | Sin horarios disponibles | — |
| CP-20 | US-06 | `disponibilidad/availability.e2e.ts` | VL | Último horario de la jornada | Evento de 30 min; slots 16:30 (V) y 17:00 (I) | 16:30 disponible; 17:00 no se ofrece | — |
| CP-21 | US-06 | `disponibilidad/availability.e2e.ts` | CE | Hora de fin anterior a la de inicio | Inicio 17:00, fin 09:00 (I) | La lista de fin solo ofrece horas posteriores al inicio; no se puede guardar el rango | Verificado en el código: la lista de hora de fin solo ofrece horas posteriores al inicio; si quedaba antes, se ajusta a inicio + 15 min. El esperado es que no exista forma de guardar el rango 17:00-09:00. |
| CP-22 | US-07 | `disponibilidad/buffer.e2e.ts` | CE | Buffer de 15 min antes y después | Buffer 15 (V); reserva existente 10:00-10:30 | Slots 9:30 y 10:30 bloqueados; 9:00 y 11:00 disponibles | Pestaña «Limits»: before/after event buffer = 15. Con slots de 30 min y una reserva de 10:00 a 10:30: **9:30 y 10:30 bloqueados; 9:00 y 11:00 disponibles**. Parametrizar. |
| CP-23 | US-07 | `disponibilidad/buffer.e2e.ts` | VL | Buffer en el mínimo | Buffer 0 (V) | Slots adyacentes disponibles | Buffer 0 («No buffer time»): 9:30 y 10:30 disponibles. |
| CP-24 | US-07 | `disponibilidad/buffer.e2e.ts` | VL | Buffer en el máximo ofrecido | Buffer 120 min, el máximo de la lista (V) | Ese martes no se ofrecen horarios antes de las 14:30 | Máximo de la lista = **120 min**. Con la reserva de 10:00 a 10:30 y disponibilidad desde las 9:00, ese día el primer horario ofrecido es **14:30**. |
| CP-25 | US-08 | `reservas/confirmacion.e2e.ts` | DE T1, TD R2 | Reserva con confirmación requerida | Evento con confirmación; invitado reserva (V) | Estado Pendiente; anfitrión notificado | Página «Your booking has been submitted»; aparece en `/bookings/unconfirmed`. |
| CP-26 | US-08 | `reservas/confirmacion.e2e.ts` | DE T2, TD R1 | Reserva sin confirmación | Evento sin confirmación (V) | Estado Confirmada automáticamente | Página «This meeting is scheduled»; aparece en `/bookings/upcoming`. |
| CP-27 | US-08 | `reservas/confirmacion.e2e.ts` | DE T3, TD R3 | Aceptar reserva pendiente | Reserva Pendiente → Aceptar | Estado Confirmada | Botón «Accept» en `/bookings/unconfirmed`. |
| CP-28 | US-08 | `reservas/confirmacion.e2e.ts` | DE T4, TD R4 | Rechazar reserva pendiente | Reserva Pendiente → Rechazar | Estado Rechazada; horario liberado | Botón «Reject» (motivo opcional). Probar por separado el estado Rechazada y el horario liberado. |
| CP-29 | US-08 | `reservas/confirmacion.e2e.ts` | DE (inválida) | Aceptar una reserva ya cancelada o rechazada | Reserva Cancelada (I) | Acción no permitida; estado sin cambios | **Posible defecto:** `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts` solo rechaza reservas ya ACCEPTED; no valida CANCELLED ni REJECTED. Probar con una petición a `bookings.confirm` (tRPC) con el id de una reserva cancelada y `confirmed: true`. Esperado: estado sin cambios. **Si falla, es un defecto**: no cambies el esperado. |
| CP-30 | US-09 | `reservas/ventana-reserva.e2e.ts` | VL | Reservar con 23 h 59 min de antelación | Aviso mínimo 24 h; slot a +23:59 (I) | Slot bloqueado | Los slots los calcula el servidor con su hora: no usar `page.clock`. Configurar el «Minimum booking notice» en 24 h y verificar que el slot inmediatamente anterior a ahora + 24 h no se ofrece. |
| CP-31 | US-09 | `reservas/ventana-reserva.e2e.ts` | VL | Reservar con 24 h exactas | Slot a +24:00 (V) | Slot disponible | El primer slot igual o posterior a ahora + 24 h se ofrece. |
| CP-32 | US-09 | `reservas/ventana-reserva.e2e.ts` | VL | Reservar al día 30 | Ventana máx. 30 días; día 30 (V) | Slot disponible | «Limit future bookings»: 30 **días calendario** (no días laborales). |
| CP-33 | US-09 | `reservas/ventana-reserva.e2e.ts` | VL | Reservar al día 31 | Día 31 (I) | Slot bloqueado | Día 31: sin horarios. |
| CP-34 | US-10 | `reservas/booking-form.e2e.ts` | CE-V5, CE-V6 | Reserva con datos válidos | Nombre (V), correo válido (V), slot libre | Reserva creada; página de confirmación | — |
| CP-35 | US-10 | `reservas/booking-form.e2e.ts` | CE-I10 | Correo del invitado inválido | invitado@ (I) | Error de formato; no se crea | Validación de formato del correo del invitado. |
| CP-36 | US-10 | `reservas/booking-form.e2e.ts` | CE-I9 | Nombre del invitado vacío | "" (I) | Mensaje de campo obligatorio | — |
| CP-37 | US-10 | `reservas/zonas-horarias.e2e.ts` | CE | Conversión de zona horaria | Anfitrión en America/Costa_Rica; invitado en Asia/Tokyo | Horarios mostrados convertidos correctamente | Usar un contexto con `timezoneId: "Asia/Tokyo"`. Costa Rica (UTC-6) a Tokio (UTC+9) son +15 h: las 9:00 de Costa Rica se muestran como las 0:00 del día siguiente. |
| CP-38 | US-10 | `reservas/zonas-horarias.e2e.ts` | VL | Reserva en fecha de cambio de horario (DST) | Invitado en America/New_York, día del cambio | Hora de la reserva correcta en ambas zonas | Contexto `timezoneId: "America/New_York"`, en un día de cambio de horario (por ejemplo, el 8 de marzo de 2026 o el 1 de noviembre de 2026). |
| CP-39 | US-12 | `reservas/cancelacion.e2e.ts` | DE T6 | Cancelar reserva confirmada desde el panel | Reserva Confirmada → Cancelar (V) | Estado Cancelada; horario liberado | — |
| CP-40 | US-12 | `reservas/cancelacion.e2e.ts` | DE T5 | Invitado cancela una reserva pendiente desde el enlace de gestión | Enlace de cancelación (V) | Estado Cancelada; slot disponible | — |
| CP-41 | US-12 | `reservas/cancelacion.e2e.ts` | CE | Enlace de cancelación ya utilizado | Reabrir enlace de reserva cancelada (I) | Mensaje de reserva ya cancelada; sin error | Abrir `/booking/{uid}` de una reserva cancelada: muestra «This event is canceled». |
| CP-42 | US-13 | `reservas/reprogramacion.e2e.ts` | DE T7 | Reprogramar a un horario libre | Nuevo slot disponible (V) | Reserva actualizada con nueva fecha y hora; horario anterior liberado | Enlace `/reschedule/{uid}`. Probar por separado la nueva hora y el horario anterior liberado. |
| CP-43 | US-13 | `reservas/reprogramacion.e2e.ts` | CE | Reprogramar a un horario ocupado | Slot ya reservado (I) | Operación rechazada; reserva original intacta | — |
| CP-44 | US-14 | `panel/bookings.e2e.ts` | CE | Panel con reservas próximas y pendientes | Usuario con reservas Confirmadas y Pendientes | El panel muestra la información de cada una | — |
| CP-45 | US-14 | `panel/bookings.e2e.ts` | CE | Filtros del panel | Filtrar por pendientes, pasadas y canceladas | Cada filtro muestra solo su categoría | Pestañas: Upcoming, Unconfirmed, Recurring, Past y Canceled (rutas `/bookings/<estado>`). Parametrizar. |
| CP-46 | US-15 | `panel/bookings.e2e.ts` | CE | Listado completo de reservas | Reservas futuras, pasadas y canceladas | Todas listadas y filtrables | — |
| CP-47 | US-16 | `webhooks/webhooks.e2e.ts` | CE | Crear webhook | URL http://localhost:4000/hook (V), eventos seleccionados (V) | Webhook registrado y activo | `/settings/developer/webhooks/new`: «Subscriber URL», «Event triggers», «Create webhook» → «Webhook created successfully!». localhost solo se acepta con `NEXT_PUBLIC_IS_E2E=1`. |
| CP-48 | US-16 | `webhooks/webhooks.e2e.ts` | CE | Webhook con URL inválida | URL no-es-url (I) | Error de validación; no se guarda | URL inválida: no se guarda. |
| CP-49 | US-04 | `api/oauth.api.e2e.ts` | CE | Inicio del flujo OAuth con Google | Clic en "Conectar Google Calendar" (V) | Redirección al proveedor con client_id y scope correctos | Inicio de la instalación: `/api/integrations/googlecalendar/add`. Verificar solo la URL de redirección. Requiere `GOOGLE_API_CREDENTIALS`. |
| CP-50 | US-10 | `api/bookings.api.e2e.ts` | CE | Creación de reserva con carga inválida | Petición sin correo ni horario (I) | HTTP 400 con detalle de validación; sin registro en BD | `POST /api/book/event` con carga inválida → HTTP 400. |
| CP-51 | US-10 | `api/bookings.api.e2e.ts` | CE | Dos reservas simultáneas al mismo slot | Dos peticiones concurrentes (V) | Solo una se crea; la otra recibe HTTP 409 (conflicto) | Dos `POST /api/book/event` en paralelo al mismo slot → uno se crea y el otro recibe **HTTP 409**. |
| CP-52 | US-10 | `api/slots.api.e2e.ts` | VL | Consulta de slots en otra zona horaria | timeZone=Asia/Tokyo (V) | Slots convertidos y sin solapamientos | Endpoint tRPC de slots (`slots.getSchedule`) con `timeZone=Asia/Tokyo`. Verificar la ruta exacta en `packages/trpc`. |
| CP-53 | US-02 | `api/acceso.api.e2e.ts` | CE | Endpoint protegido sin sesión | Petición sin cookie de sesión (I) | HTTP 401 o redirección; sin datos expuestos | Sin cookie de sesión: 401 o redirección, sin datos. Precisar en el código cuál de los dos ocurre y usar ese en el `expect`. |
| CP-54 | US-15 | `api/acceso.api.e2e.ts` | CE | Acceder a la reserva de otro usuario | Usuario A consulta la reserva de B (I) | HTTP 403 o 404; sin datos de B | Precisar en el código si responde 403 o 404 y usar ese. |
| CP-55 | US-16 | `api/webhooks.api.e2e.ts` | CE | Webhook al crear reserva | Crear reserva con webhook activo (V) | El receptor recibe BOOKING_CREATED con datos correctos | El evento **no** debe requerir confirmación; si la requiere, se envía BOOKING_REQUESTED en lugar de BOOKING_CREATED. |
| CP-56 | US-16 | `api/webhooks.api.e2e.ts` | CE | Webhook al cancelar reserva | Cancelar reserva (V) | El receptor recibe BOOKING_CANCELLED | — |
| CP-57 | US-16 | `api/webhooks.api.e2e.ts` | CE | Webhook al reprogramar reserva | Reprogramar reserva (V) | El receptor recibe BOOKING_RESCHEDULED con la nueva hora | — |
| CP-58 | US-16 | `api/webhooks.api.e2e.ts` | CE | Firma del webhook | Webhook con secreto configurado (V) | La cabecera de firma es válida con el secreto correcto | Cabecera `X-Cal-Signature-256` = HMAC-SHA256 (hex) del cuerpo con el secreto (ver `packages/features/webhooks/lib/sendPayload.ts`). |
| CP-59 | US-02 | `regresion/fork.e2e.ts` | CE | Rutas de funcionalidades empresariales removidas (facturación, organizaciones, equipos) | Acceso directo a esas rutas (I) | 404 o redirección controlada; nunca error 500 | Rutas candidatas: `/teams`, `/insights`, `/workflows`, `/routing-forms`, `/settings/billing`, `/settings/organizations`, `/settings/teams` y `/enterprise` (esta redirige a `/`). Confirmar cuáles siguen existiendo. El esperado es nunca un 500. Parametrizar. |
| CP-60 | US-03 | `regresion/fork.e2e.ts` | CE | Páginas de configuración tras la remoción | Navegar por todas las secciones de ajustes (V) | Cargan sin errores de consola ni enlaces rotos | Recorrer las secciones de `/settings` sin errores de consola (`page.on("console")`) ni enlaces rotos. Puede requerir dividir por sección. |
| CP-61 | US-05 | `regresion/fork.e2e.ts` | CE | Formulario de tipo de evento sin opciones empresariales | Abrir y guardar un evento (V) | Sin campos ni referencias rotas; se guarda correctamente | — |
| CP-62 | US-10 | `regresion/smoke.e2e.ts` | DE | Flujo completo de reserva (humo) | Crear evento → reservar → confirmar → cancelar (V) | Flujo íntegro sin errores | Flujo de humo: crear evento con confirmación → reservar → aceptar → cancelar. El único `expect` va al final; los pasos intermedios pueden usar `test.step` sin `expect`. |
| CP-63 | US-04 | `MANUAL (no se automatiza)` | CE | Evento reservado se refleja en Google Calendar | Cuenta Google de prueba conectada (V) | El evento aparece en el calendario externo | — |
| CP-64 | US-04 | `MANUAL (no se automatiza)` | CE | Evento externo bloquea disponibilidad | Evento creado en Google Calendar (V) | Ese horario deja de ofrecerse en la página de reserva | — |
| CP-65 | US-11 | `MANUAL (no se automatiza)` | CE | Correo de confirmación | Reserva completada (V) | Invitado y anfitrión reciben correo con fecha, hora y ubicación correctas | — |
| CP-66 | US-13 | `MANUAL (no se automatiza)` | DE T7 | Reprogramación sincronizada con calendario externo | Reprogramar reserva sincronizada (V) | El calendario externo se actualiza con la nueva hora | — |
| CP-67 | US-10 | `MANUAL (no se automatiza)` | Exploratoria | Experiencia en móvil de la página de reserva | Emulación de 360 px y 768 px | Diseño legible y flujo completable | — |
| CP-68 | US-05, US-06 | `MANUAL (no se automatiza)` | Exploratoria | Claridad de los formularios de configuración | Lista de comprobación de usabilidad | Etiquetas, mensajes de error y flujo comprensibles | — |

## 8. Ejecución, evidencias y métricas

```bash
# Un archivo mientras se desarrolla
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa/auth/login.e2e.ts --workers=6

# Suite completa del curso, en paralelo
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa --workers=6

# Ver el reporte HTML y un trace
npx playwright show-report test-results/reports/playwright-html-report
npx playwright show-trace <ruta-al-trace.zip>
```

- **Usa siempre `--workers=6`.** Las pruebas siguen corriendo en paralelo. Con los 16 procesos por defecto, la máquina se satura y Prisma falla al crear o borrar usuarios de prueba (`Unable to start a transaction in the given time`); con 6 pasaron 50 de 50.
- **Al terminar cada ejecución completa**, guarda una copia del reporte HTML y de `test-results/reports/results.xml` (JUnit) en `apps/web/playwright/proyecto-qa/evidencias/<fecha>/`. Las vamos a usar en el informe de pruebas. Las evidencias manuales se describen en la **sección 12**.
- **Métricas que necesito para el informe:**
  - Pruebas ejecutadas, aprobadas y fallidas, por tipo (sistema, integración, regresión) y por historia de usuario
  - Duración total y por archivo
  - Defectos por severidad
  - Porcentaje de casos del plan automatizados
  Cuando te lo pida, genera estas tablas a partir del JUnit.
- **Al final, en `proyecto-qa/README.md`:** cómo preparar el entorno, cómo ejecutar la suite, la tabla CP → archivo → estado y las limitaciones conocidas.

## 9. Orden de trabajo y reparto

**Ciclo por cada archivo:** guion manual → ejecución manual (la hago yo) → registro en `EJECUCION_MANUAL.md` → automatización → ejecución headless → visto bueno → commit.

1. Fase 0 (sección 2) y puesta en marcha (sección 3), con la prueba de humo.
2. **Kendall, por su cuenta:** `auth/login.e2e.ts` (CP-03 a CP-08), empezando por el guion manual. Fija el patrón de código y crea los helpers compartidos en `proyecto-qa/lib/`. Al terminar, escribir la sección «Patrón de las pruebas» en `proyecto-qa/README.md` y subir todo a `proyecto-qa` para que Gary parta de ahí.
   - Mientras no exista esa sección, Gary prepara su entorno, crea sus suites en QAtlas y ejecuta a mano CP-34 a CP-38, sin escribir archivos `.e2e.ts`.
3. Cada integrante sigue con sus módulos en su propia rama y junta a `proyecto-qa` cada vez que termina un archivo.
4. Al final: ejecución completa de la suite en paralelo, evidencias, `DEFECTOS.md` y métricas.

### Reparto actualizado

| Integrante | Rama | Responsabilidad |
|---|---|---|
| **Kendall** | `qa-kendall` | Automatiza con Playwright los 62 casos (CP-01 a CP-62), mantiene `proyecto-qa/lib/` y publica los resultados en QAtlas. |
| **Gary** | `qa-gary` si necesita cambios en Git | Elabora el documento del proyecto y apoya con las ejecuciones manuales que se acuerden. |

**Orden de automatización:** `auth/logout`, `perfil/perfil`, `event-types/event-type`, `disponibilidad/availability`, `disponibilidad/buffer`, `reservas/confirmacion`, `reservas/ventana-reserva`, `reservas/booking-form`, `reservas/zonas-horarias`, `reservas/cancelacion`, `reservas/reprogramacion`, `panel/bookings`, `webhooks/webhooks`, `api/*`, `regresion/fork`, `regresion/smoke` y, al final, `auth/registro`.

- Cuando empieces, **pregúntame quién está trabajando**.
- **`proyecto-qa/lib/` es compartido:** antes de modificar algo ahí, avísame para coordinarlo con el otro integrante.

## 10. Entorno en Windows (WSL2)

Lo aprendido en la instalación de Kendall (Windows 11 + WSL2). Sigue este orden:

1. **Memoria de WSL:** crea `C:\Users\<usuario>\.wslconfig` con
   ```ini
   [wsl2]
   memory=12GB
   ```
   y luego, en PowerShell, `wsl --shutdown` para aplicarlo.
2. **Ubuntu 24.04 en WSL2:** `wsl --install -d Ubuntu-24.04`. Si se queda pegado descargando, usa `wsl --install -d Ubuntu-24.04 --web-download`. Comprueba con `wsl -l -v` que diga VERSION 2.
3. **Paquetes base** en Ubuntu: `sudo apt update && sudo apt install -y git curl build-essential openssl`.
4. **Docker Desktop:** Settings → Resources → WSL integration → activar Ubuntu-24.04. En Ubuntu, `docker info` debe responder.
5. **Node y Yarn:** instala nvm, luego `nvm install 22 && nvm alias default 22`, y después `corepack enable` (debe dar Yarn 4.12.0 dentro del repositorio).
   - Si `which node` o `which yarn` muestran `/mnt/c/...`, se está usando el Node de Windows: falta `source ~/.nvm/nvm.sh` (o abrir una terminal nueva).
6. **Clonar dentro de `~/`, nunca en `/mnt/c`** (los enlaces simbólicos y el rendimiento fallan en el disco de Windows):
   ```bash
   cd ~ && git clone --filter=blob:none https://github.com/kendall122/cal.diy.git && cd cal.diy
   git remote add upstream https://github.com/calcom/cal.diy.git
   ```
7. **Git:**
   ```bash
   git config --global user.name "<tu nombre>"
   git config --global user.email "<tu correo de GitHub>"
   git config --global credential.helper "/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe"
   ```
   El credential helper usa el Git Credential Manager de Windows (requiere Git for Windows instalado), así el push abre el inicio de sesión de GitHub en el navegador.
8. **VS Code conectado a WSL:** desde Ubuntu, `code ~/cal.diy` (o en VS Code: «Connect to WSL»). La extensión de Claude Code se instala **del lado de WSL** (en la vista de extensiones, «Install in WSL: Ubuntu-24.04»).
9. **Memoria de Node:** usa `NODE_OPTIONS="--max-old-space-size=6144"`, no 8192, porque los 12 GB de WSL se comparten con Docker (Postgres).

## 11. Registro en QAtlas

- **Un solo plan:** «Plan de pruebas cal.diy · commit ae027bb» (ya lo creó Kendall).
- **Suites:**

  | Suite | Casos | La crea |
  |---|---|---|
  | S1 Autenticación y perfil | CP-01 a CP-12 | Kendall (hecha) |
  | S2 Tipos de evento y disponibilidad | CP-13 a CP-24 | Kendall (hecha) |
  | S3 Reservas: confirmación y ventana | CP-25 a CP-33 | Kendall (hecha) |
  | S4 Reservas: formulario, zonas horarias, cancelación, reprogramación y panel | CP-34 a CP-46 | **Gary**, y la vincula al plan |
  | S5 Integración: webhooks y API | CP-47 a CP-58 | **Gary**, y la vincula al plan |
  | S6 Regresión | CP-59 a CP-62 | **Gary**, y la vincula al plan |
  | S7 Manuales | CP-63 a CP-68 | **Gary** la sube |

- **Ejecuciones manuales:** una por suite, creada al empezar cada módulo, con el nombre `Ejecución manual <suite> - <nombre>` (por ejemplo `Ejecución manual S1 - Kendall`).
- **Ejecuciones automatizadas:** son corridas completas de la suite:
  - «Ejecución automatizada · Playwright»: se publica con `node apps/web/playwright/proyecto-qa/lib/publicar-qatlas.mjs --enviar`, que agrupa las pruebas por CP (ver `README.md`). No uses «Importar resultados (JUnit)», porque no relaciona nuestros Id.
  - «Regresión final»: la última corrida completa antes del informe.
- **Id de automatización** de cada caso: `<archivo>#CP-xx`, relativo a `proyecto-qa/` (por ejemplo `auth/login.e2e.ts#CP-03`).
- **Cambios de dueño pendientes en QAtlas:** CP-34 → Gary; CP-67 y CP-68 → Kendall.
- **CP divididos en varias pruebas:** el script envía un solo resultado por CP y lo marca fallido si falla cualquiera de sus pruebas.
- **Token:** cada integrante usa el suyo en `.env.qatlas`; nunca se sube a Git.

## 12. Evidencias

- **En QAtlas**, en cada paso de la ejecución manual: marca el resultado, escribe «¿Qué pasó realmente?» si difiere del esperado y pega la captura (Ctrl+V).
  - **Si el caso pasa:** una captura del resultado final.
  - **Si falla:** capturas de los pasos o un video, más la consola o la pestaña Red (Network) de las DevTools si aplica.
- **En el repositorio:** guarda también las capturas en `proyecto-qa/evidencias/manual/CP-xx_<fecha>.png` (fecha `AAAA-MM-DD`).
- **Videos:** van a Drive, **no a Git**; pon el enlace en las observaciones de QAtlas y de `EJECUCION_MANUAL.md`.
- **`EJECUCION_MANUAL.md`** tiene la columna «Evidencia» con la ruta de la captura o el enlace al video.
- **Evidencias automatizadas:** ver la sección 8 (reporte HTML y JUnit en `evidencias/<fecha>/`).

**Empieza ahora preguntándome quién está trabajando y después ejecuta la Fase 0 (sección 2). No avances a la siguiente sección sin mi confirmación.**
