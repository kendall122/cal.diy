import { expect } from "@playwright/test";
import { localize } from "../../lib/localize";
import { captureEvidence, test } from "../lib/qa-test";
import { retryOnBusyDatabase } from "../lib/reservas";

const NEW_WEBHOOK_URL = "/settings/developer/webhooks/new";
const VALID_URL = "http://localhost:4000/hook";

test.describe.configure({ mode: "parallel" });

test.describe("US-16 Configuración de webhooks", () => {
  let userId: number;

  test.beforeEach(async ({ page, users }) => {
    const user = await retryOnBusyDatabase(() => users.create());
    userId = user.id;
    await user.apiLogin(NEW_WEBHOOK_URL);
    await page.locator("input[name=subscriberUrl]").waitFor();
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-47 confirma la creación del webhook", async ({ page }) => {
    const t = await localize("en");
    await page.locator("input[name=subscriberUrl]").fill(VALID_URL);
    await page.locator("[data-testid=create_webhook]").click();

    await expect(page.getByText(t("webhook_created_successfully"))).toBeVisible();
  });

  test("CP-47 deja el webhook activo", async ({ page, prisma }) => {
    await page.locator("input[name=subscriberUrl]").fill(VALID_URL);
    await page.locator("[data-testid=create_webhook]").click();
    await page.waitForURL((url) => url.pathname.endsWith("/settings/developer/webhooks"));
    const webhook = await prisma.webhook.findFirstOrThrow({
      where: { userId, subscriberUrl: VALID_URL },
      select: { active: true },
    });

    expect(webhook.active).toBe(true);
  });

  test("CP-48 no guarda un webhook con URL inválida", async ({ page, prisma }) => {
    await page.locator("input[name=subscriberUrl]").fill("no-es-url");
    await page.locator("[data-testid=create_webhook]").click();
    await page.locator("input[name=subscriberUrl]:invalid").waitFor();
    const saved = await prisma.webhook.count({ where: { userId } });

    expect(saved).toBe(0);
  });
});
