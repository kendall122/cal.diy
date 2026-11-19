import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import { createEventType, retryOnBusyDatabase } from "../lib/reservas";

const REMOVED_ROUTES = [
  "/teams",
  "/insights",
  "/workflows",
  "/routing-forms",
  "/settings/billing",
  "/settings/organizations",
  "/settings/teams",
  "/enterprise",
];

const SETTINGS_ROUTES = [
  "/settings/my-account/profile",
  "/settings/my-account/general",
  "/settings/my-account/calendars",
  "/settings/my-account/conferencing",
  "/settings/my-account/appearance",
  "/settings/my-account/out-of-office",
  "/settings/my-account/push-notifications",
  "/settings/security/password",
  "/settings/security/two-factor-auth",
  "/settings/developer/webhooks",
  "/settings/developer/oauth",
  "/settings/developer/api-keys",
];

test.describe.configure({ mode: "parallel" });

test.describe("Regresión del fork", () => {
  let hostId: number;

  test.beforeEach(async ({ users }) => {
    const user = await retryOnBusyDatabase(() => users.create());
    hostId = user.id;
    await user.apiLogin("/event-types");
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  for (const route of REMOVED_ROUTES) {
    test(`CP-59 ${route} no responde con error del servidor`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status() ?? 0).toBeLessThan(500);
    });
  }

  for (const route of SETTINGS_ROUTES) {
    test(`CP-60 ${route} carga sin errores de consola`, async ({ page }) => {
      // Salir antes de escuchar evita contar consultas canceladas de la página anterior.
      await page.goto("about:blank");
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      expect(errors).toEqual([]);
    });
  }

  test("CP-61 guarda el formulario del tipo de evento", async ({ page, prisma }) => {
    const description = "Evento revisado por QA";
    const eventType = await createEventType(prisma, hostId, "qa-formulario-evento");
    await page.goto(`/event-types/${eventType.id}?tabName=setup`);
    await page.locator('[contenteditable="true"]').first().fill(description);
    const saved = page.waitForResponse("**/api/trpc/eventTypesHeavy/update**");
    await page.locator("[data-testid=update-eventtype]").click();
    await saved;
    const stored = await prisma.eventType.findUniqueOrThrow({
      where: { id: eventType.id },
      select: { description: true },
    });

    expect(stored.description).toContain(description);
  });
});
