# Proyecto de pruebas automatizadas de cal.diy

Suite de Playwright del curso *Aseguramiento de la Calidad de Software* (TEC, grupo 50).
Commit probado: `ae027bb70e694e2d2c44569f398d6cbcee0389b1`.

## Reparto

- **Kendall:** automatiza los 62 casos con Playwright, mantiene `lib/` y publica los resultados en QAtlas.
- **Gary:** elabora el documento del proyecto y apoya con las ejecuciones manuales acordadas.

Para instalar el entorno, sigue las secciones 2, 3 y 10 de [PROMPT_PROYECTO_QA.md](PROMPT_PROYECTO_QA.md). El registro manual está en [EJECUCION_MANUAL.md](EJECUCION_MANUAL.md).

## Ejecución

Requisitos: `.env` con `NEXT_PUBLIC_IS_E2E=1`, base de datos levantada con `yarn dx` y la app en `http://localhost:3000` (`yarn dx` la deja corriendo; si no, `yarn dev`). Playwright reutiliza el servidor si ya está en el puerto 3000.

`yarn e2e` ya incluye `--project=@calcom/web` y define `NEXT_PUBLIC_IS_E2E=1`, así que no hay que repetirlos. Usa siempre `--workers=6`: las pruebas siguen en paralelo y se evita saturar la máquina, lo que hace fallar a Prisma al crear o borrar usuarios de prueba.

```bash
# Un archivo
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa/auth/login.e2e.ts --workers=6

# Suite completa del curso, en paralelo
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa --workers=6

# Reporte HTML y traces
npx playwright show-report test-results/reports/playwright-html-report
npx playwright show-trace <ruta-al-trace.zip>
```

## Estado de la automatización

- **Cobertura:** 62 de 68 casos (91,2 %), con 120 pruebas. CP-63 a CP-68 son manuales.
- **Última corrida:** 117 aprobadas y 3 fallidas, 6 procesos, unos 2,5 minutos. Resultado en `evidencias/2026-11-18/results.xml`.
- **Fallos atribuidos a la aplicación:** CP-29, CP-51 y CP-54. CP-60 falla de forma intermitente en el perfil. Ver `DEFECTOS.md`.
- **CP-11:** se acepta como aprobado porque el cambio se rechaza y el nombre no se guarda; el mensaje poco claro queda como observación.
- **Limitación:** CP-43 pasa por API, pero `CL-BUG-4` describe un fallo en la pantalla que debe revisarse.

### Corrida recomendada

El modo desarrollo satura la memoria en WSL con 12 GB. Usa un build de producción:

```bash
(cd packages/trpc && yarn build)
yarn workspace @calcom/web copy-app-store-static
(cd apps/web && NEXT_PUBLIC_IS_E2E=1 NODE_OPTIONS=--max-old-space-size=6144 yarn next build)
(cd apps/web && NEXT_PUBLIC_IS_E2E=1 yarn next start -p 3000)
```

`auth/registro.e2e.ts` levanta su propia base vacía en el puerto 5452 y otra instancia en el 3100, y las elimina al terminar.

## Patrón de las pruebas

El ejemplo de referencia es [auth/login.e2e.ts](auth/login.e2e.ts), con sus utilidades en [lib/login.ts](lib/login.ts).

**Ciclo por archivo:** guion manual → ejecución manual con captura → registro en `EJECUCION_MANUAL.md` → prueba automatizada → ejecución con `--workers=6` → revisión → commit en tu rama → merge a `proyecto-qa`.

```ts
import { expect } from "@playwright/test";

import { test } from "../../lib/fixtures";
import { localize } from "../../lib/localize";

const casos = [
  { cp: "CP-xx", nombre: "primer dato", valor: "a" },
  { cp: "CP-yy", nombre: "segundo dato", valor: "b" },
];

test.describe.configure({ mode: "parallel" });

test.describe("US-xx Nombre de la historia", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ruta");
  });

  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  for (const { cp, nombre, valor } of casos) {
    test(`${cp} describe el resultado con ${nombre}`, async ({ page, users }) => {
      const t = await localize("en");
      const user = await users.create();
      // Preparar y actuar, sin expect.

      await expect(page.getByText(t("clave_de_traduccion"))).toBeVisible();
    });
  }
});
```

| Regla | Cómo aplicarla |
|---|---|
| Nombre | El título empieza con el CP y describe el resultado esperado, en español. |
| Un solo `expect` | Si un caso verifica dos cosas, escribe dos pruebas con el mismo CP, como CP-04 (error y sin sesión). |
| Esperas | Usa `waitForURL`, `waitForResponse` o `locator.waitFor()`. No uses `waitForTimeout`. |
| Datos | Cada prueba crea los suyos con `users.create()`. No uses las cuentas semilla. |
| Contraseña del fixture | No es el nombre de usuario: usa `getDefaultPassword(user.username ?? "")` de `../../lib/testUtils`. |
| Textos | Usa `localize("en")` con claves de `packages/i18n/locales/en/common.json`. Playwright corre en inglés aunque tu navegador esté en español. |
| Selectores | Verifícalos en el código y prefiere `data-testid` o `id`. |
| Verificar que algo no ocurrió | Espera primero una señal de que la acción terminó. CP-07 espera el error del campo antes de comprobar que no hubo petición. |
| Utilidades | Lo específico de un módulo va en su archivo. `lib/` es compartido: coordina los cambios con el otro integrante. |
| Si falla | Corrige la prueba solo si el error es suyo. Si la app no cumple el plan, registra el defecto y deja el resultado esperado. |
| Commits | `test(modulo): CP-xx a CP-yy descripción`. Trae antes los cambios con `git fetch origin && git merge origin/proyecto-qa`. |

## Publicar resultados en QAtlas

No uses «Importar resultados (JUnit)»: QAtlas busca el nombre del test, y el nuestro no coincide con el Id `archivo#CP-xx`. Tampoco el reporter oficial: si un CP dividido se envía dos veces, gana el último resultado y un fallo podría quedar oculto.

Usa [lib/publicar-qatlas.mjs](lib/publicar-qatlas.mjs). Lee `test-results/reports/results.xml`, agrupa por CP y marca el caso como fallido si falla cualquiera de sus pruebas.

Crea un token en tu perfil de QAtlas y guárdalo en `.env.qatlas`, en la raíz del repositorio (Git lo ignora):

```bash
QATLAS_URL=<dirección de QAtlas>/api
QATLAS_TOKEN=<tu token>
```

```bash
# Simulación: muestra el resultado por CP y comprueba los Id, sin escribir nada
node apps/web/playwright/proyecto-qa/lib/publicar-qatlas.mjs

# Registra la ejecución; repetirlo el mismo día con el mismo commit la actualiza
node apps/web/playwright/proyecto-qa/lib/publicar-qatlas.mjs --enviar

# Registra y cierra la ejecución (hazlo solo en la corrida final)
node apps/web/playwright/proyecto-qa/lib/publicar-qatlas.mjs --enviar --completar
```

Opciones: `--archivo <ruta>`, `--nombre <texto>`, `--id-corrida <texto>` y `--proyecto <código>`.
