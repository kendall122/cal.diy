import { mkdirSync } from "node:fs";
import { join, sep } from "node:path";
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

type EvidenceEntry = {
  method: string;
  target: string;
  status: number | string;
  detail: string;
};

const MAX_DETAIL_LENGTH = 500;
const evidenceLogs = new Map<string, EvidenceEntry[]>();
const LOGGED_METHODS = new Set(["get", "post", "put", "patch", "delete", "fetch"]);

// Las pruebas sin pantalla dejan como evidencia las llamadas que hicieron y lo que respondió el servidor.
export function logEvidence(testInfo: TestInfo, entry: EvidenceEntry): void {
  const entries = evidenceLogs.get(testInfo.testId) ?? [];
  entries.push({ ...entry, detail: entry.detail.slice(0, MAX_DETAIL_LENGTH) });
  evidenceLogs.set(testInfo.testId, entries);
}

function recordRequests(context: APIRequestContext, testInfo: TestInfo): APIRequestContext {
  return new Proxy(context, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !LOGGED_METHODS.has(property) || typeof value !== "function") {
        return value;
      }
      return async (url: string, options?: unknown) => {
        const response = await value.call(target, url, options);
        const path = new URL(response.url()).pathname;
        logEvidence(testInfo, {
          method: property.toUpperCase(),
          target: path,
          status: response.status(),
          detail: await response.text().catch(() => ""),
        });
        return response;
      };
    },
  });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (character) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[character]};`
  );
}

function renderEvidence(title: string, entries: EvidenceEntry[]): string {
  const rows = entries
    .map(
      ({ method, target, status, detail }) =>
        `<tr><td>${escapeHtml(method)}</td><td>${escapeHtml(target)}</td><td>${escapeHtml(String(status))}</td><td><pre>${escapeHtml(detail)}</pre></td></tr>`
    )
    .join("");
  return `<style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}pre{margin:0;white-space:pre-wrap;word-break:break-all;font-size:11px}</style><h2>${escapeHtml(title)}</h2><p>Registro de las llamadas a la API hechas por la prueba.</p><table><tr><th>Método</th><th>Ruta</th><th>Estado</th><th>Respuesta</th></tr>${rows}</table>`;
}

export const test = base.extend<{ request: APIRequestContext }>({
  // El contexto `request` por defecto falla con el storageState del repositorio; el de la página es equivalente.
  request: async ({ page }, use, testInfo) => {
    await use(recordRequests(page.request, testInfo));
    evidenceLogs.delete(testInfo.testId);
  },
});

// Debe llamarse antes de borrar los datos: sin el usuario, la página cambia o muestra un error.
// Solo se activa con QA_EVIDENCE_DIR, para no generar archivos en las corridas normales.
export async function captureEvidence(page: Page, testInfo: TestInfo): Promise<void> {
  const directory = process.env.QA_EVIDENCE_DIR;
  if (!directory || page.isClosed()) return;
  const entries = evidenceLogs.get(testInfo.testId) ?? [];
  // En las pruebas de API la evidencia útil es la respuesta del servidor, no la última pantalla abierta.
  const isApiTest = testInfo.file.includes(`${sep}api${sep}`);
  if ((isApiTest || page.url() === "about:blank") && entries.length > 0) {
    // Salir primero evita que la aplicación anterior siga dibujando sobre el registro.
    await page.goto("about:blank");
    await page.setContent(renderEvidence(testInfo.title, entries));
  } else if (page.url() === "about:blank") {
    return;
  }
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
