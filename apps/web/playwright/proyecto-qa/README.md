# Proyecto de pruebas automatizadas de cal.diy

Suite de Playwright del curso *Aseguramiento de la Calidad de Software* (TEC, grupo 50).
Commit probado: `ae027bb70e694e2d2c44569f398d6cbcee0389b1`.

## Para empezar (Gary)

1. Lee [PROMPT_PROYECTO_QA.md](PROMPT_PROYECTO_QA.md) completo: reglas, reparto (secciones 5 y 9) y tus casos CP-34 a CP-66 (sección 7).
2. Pídele a Kendall acceso de colaborador al fork `kendall122/cal.diy` (necesario para hacer push).
3. Configura Windows + WSL2 siguiendo la **sección 10** del PROMPT y clona el fork en `~/cal.diy`.
4. Para que Claude Code cargue el PROMPT, crea `~/cal.diy/CLAUDE.local.md` con la línea `@apps/web/playwright/proyecto-qa/PROMPT_PROYECTO_QA.md` y agrega `CLAUDE.local.md` a `.git/info/exclude`.
5. Haz la Fase 0 (sección 2) y la puesta en marcha (sección 3), hasta que pase la prueba de humo.
6. Crea tu rama: `git fetch origin && git checkout -b qa-gary origin/proyecto-qa`.
7. En QAtlas, crea las suites S4, S5 y S6 y vincúlalas al plan; sube S7 (sección 11).
8. Sigue el ciclo de la sección «Patrón de las pruebas»: primero ejecuta a mano los casos de cada archivo, empezando por CP-34 a CP-36, y regístralos en QAtlas y en [EJECUCION_MANUAL.md](EJECUCION_MANUAL.md).

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

## QAtlas: relación entre JUnit y casos

_Pendiente: se documenta tras importar el JUnit de `auth/login.e2e.ts` (cómo se asocia `archivo#CP-xx` y cómo se tratan los CP divididos en varias pruebas)._
