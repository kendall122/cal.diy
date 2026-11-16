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
8. **No escribas código todavía:** espera la sección «Patrón de las pruebas» de abajo. Mientras tanto, ejecuta a mano CP-34 a CP-38 (registra en QAtlas y en [EJECUCION_MANUAL.md](EJECUCION_MANUAL.md)).

## Ejecución

Requisitos: `.env` con `NEXT_PUBLIC_IS_E2E=1`, base de datos levantada con `yarn dx` y la app en `http://localhost:3000` (`yarn dx` la deja corriendo; si no, `yarn dev`). Playwright reutiliza el servidor si ya está en el puerto 3000.

`yarn e2e` ya incluye `--project=@calcom/web` y define `NEXT_PUBLIC_IS_E2E=1`, así que no hay que repetirlos.

```bash
# Un archivo
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa/auth/login.e2e.ts

# Suite completa del curso, en paralelo
PLAYWRIGHT_HEADLESS=1 yarn e2e apps/web/playwright/proyecto-qa

# Reporte HTML y traces
npx playwright show-report test-results/reports/playwright-html-report
npx playwright show-trace <ruta-al-trace.zip>
```

## Patrón de las pruebas

_Pendiente: Kendall lo completa al terminar `auth/login.e2e.ts` (CP-03 a CP-08). Hasta entonces, no escribas archivos `.e2e.ts`._

## QAtlas: relación entre JUnit y casos

_Pendiente: se documenta tras importar el JUnit de `auth/login.e2e.ts` (cómo se asocia `archivo#CP-xx` y cómo se tratan los CP divididos en varias pruebas)._
