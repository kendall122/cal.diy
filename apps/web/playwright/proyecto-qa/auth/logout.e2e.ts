import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { localize } from "../../lib/localize";
import { retryOnBusyDatabase } from "../lib/reservas";

test.describe.configure({ mode: "parallel" });

test.describe("US-02 Cierre de sesión", () => {
  test.beforeEach(async ({ users }) => {
    const user = await retryOnBusyDatabase(() => users.create());
    await user.apiLogin("/event-types");
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-09 redirige al login al abrir una ruta protegida tras cerrar sesión", async ({ page }) => {
    const t = await localize("en");

    await page.locator("[data-testid=user-dropdown-trigger-button]:visible").click();
    await page.getByRole("menuitem", { name: t("sign_out") }).click();
    await page.waitForURL("**/auth/logout**");
    await page.locator("[data-testid=logout-btn]").waitFor();
    await page.goto("/event-types");

    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
