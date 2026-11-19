import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { test as base } from "../../lib/fixtures";

function evidenceFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return `${slug.replace(/^CP-(\d{2})-/, "CP-$1_")}.png`;
}

export const test = base.extend<{ request: APIRequestContext }>({
  // El contexto `request` por defecto falla con el storageState del repositorio; el de la página es equivalente.
  request: async ({ page }, use) => {
    await use(page.request);
  },
});

// Debe llamarse antes de borrar los datos: sin el usuario, la página cambia o muestra un error.
// Solo se activa con QA_EVIDENCE_DIR, para no generar archivos en las corridas normales.
export async function captureEvidence(page: Page, testInfo: TestInfo): Promise<void> {
  const directory = process.env.QA_EVIDENCE_DIR;
  if (!directory || page.isClosed() || page.url() === "about:blank") return;
  // Sin esta espera la captura puede mostrar los esqueletos de carga en lugar del resultado.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page
    .locator(".animate-pulse")
    .first()
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => undefined);
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, evidenceFileName(testInfo.title)) });
}
