import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { localize } from "../../lib/localize";
import {
  EMPTY_INSTANCE_URL,
  queryEmptyInstance,
  startEmptyInstance,
  stopEmptyInstance,
} from "../lib/instancia-vacia";

type AdminForm = {
  username: string;
  fullName: string;
  email: string;
  password: string;
};

const validAdmin: AdminForm = {
  username: "admin",
  fullName: "Admin QA",
  email: "admin@test.com",
  password: "Admin#2026Segura",
};
const SETUP_SUBMIT = '#wizard-step-1 button[type="submit"]';
const INSTANCE_START_TIMEOUT = 600_000;

async function fillAdminForm(page: Page, { username, fullName, email, password }: AdminForm): Promise<void> {
  await page.goto("/auth/setup?step=1");
  await page.locator("input[name=username]").fill(username);
  await page.locator("input[name=full_name]").fill(fullName);
  await page.locator("input[name=email_address]").fill(email);
  await page.locator("input[name=password]").fill(password);
}

// Comparten una instancia vacía: los datos inválidos deben probarse antes de crear el primer usuario.
test.describe.configure({ mode: "serial" });
test.use({ baseURL: EMPTY_INSTANCE_URL });

test.describe("US-01 Registro del primer usuario", () => {
  test.beforeAll(async () => {
    test.setTimeout(INSTANCE_START_TIMEOUT);
    await startEmptyInstance();
  });

  test.afterAll(() => {
    stopEmptyInstance();
  });

  test("CP-02 muestra el error de correo inválido", async ({ page }) => {
    const t = await localize("en");
    await fillAdminForm(page, { ...validAdmin, email: "admin.test.com" });

    await expect(page.getByText(t("enter_valid_email"))).toBeVisible();
  });

  test("CP-02 no permite continuar con una contraseña inválida", async ({ page }) => {
    await fillAdminForm(page, { ...validAdmin, password: "123" });

    await expect(page.locator(SETUP_SUBMIT)).toBeDisabled();
  });

  test("CP-02 no crea la cuenta con datos inválidos", async ({ page }) => {
    await fillAdminForm(page, { ...validAdmin, email: "admin.test.com", password: "123" });
    await page.locator(SETUP_SUBMIT).waitFor();

    expect(queryEmptyInstance("select count(*) from users")).toBe("0");
  });

  test("CP-01 crea el primer usuario con rol administrador", async ({ page }) => {
    await fillAdminForm(page, validAdmin);
    const created = page.waitForResponse("**/api/auth/setup");
    await page.locator(SETUP_SUBMIT).click();
    await created;

    expect(queryEmptyInstance(`select role from users where email = '${validAdmin.email}'`)).toBe("ADMIN");
  });

  test("CP-01 permite al administrador abrir la configuración de la instancia", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator("#email").fill(validAdmin.email);
    await page.locator("#password").fill(validAdmin.password);
    await page.locator('[data-testid=login-form] [type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"));
    await page.goto("/settings/admin");

    await expect(page).toHaveURL(/\/settings\/admin/);
  });
});
