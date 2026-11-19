import { expect } from "@playwright/test";
import type { createUsersFixture } from "../../fixtures/users";
import { localize } from "../../lib/localize";
import { getDefaultPassword } from "../../lib/testUtils";
import type { LoginCredentials } from "../lib/login";
import {
  clickLoginSubmit,
  fillLoginForm,
  isCredentialsRequest,
  loginFieldError,
  submitCredentials,
} from "../lib/login";
import { captureEvidence, test } from "../lib/qa-test";
import { retryOnBusyDatabase } from "../lib/reservas";

type UsersFixture = ReturnType<typeof createUsersFixture>;

type InvalidLoginCase = {
  cp: string;
  scenario: string;
  checksSession: boolean;
  credentials: (users: UsersFixture) => Promise<LoginCredentials>;
};

const UNREGISTERED_EMAIL = "noexiste@test.com";

async function createUserCredentials(users: UsersFixture): Promise<LoginCredentials> {
  const user = await users.create();
  return { email: user.email, password: getDefaultPassword(user.username ?? "") };
}

const invalidLogins: InvalidLoginCase[] = [
  {
    cp: "CP-04",
    scenario: "contraseña incorrecta",
    checksSession: true,
    credentials: async (users) => ({
      email: (await createUserCredentials(users)).email,
      password: "Incorrecta#1",
    }),
  },
  {
    cp: "CP-05",
    scenario: "correo no registrado con la contraseña de otro usuario",
    checksSession: false,
    credentials: async (users) => ({
      email: UNREGISTERED_EMAIL,
      password: (await createUserCredentials(users)).password,
    }),
  },
  {
    cp: "CP-06",
    scenario: "correo no registrado y contraseña errónea",
    checksSession: true,
    credentials: async () => ({ email: UNREGISTERED_EMAIL, password: "xxxx" }),
  },
];

const requiredFields = [
  { name: "correo", selector: "#email" },
  { name: "contraseña", selector: "#password" },
] as const;

test.describe.configure({ mode: "parallel" });

test.describe("US-02 Inicio de sesión", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-03 inicia sesión con credenciales válidas y accede al panel", async ({ page, users }) => {
    await submitCredentials(page, await createUserCredentials(users));
    await page.waitForURL("**/event-types");

    await expect(page.locator("[data-testid=dashboard-shell]")).toBeVisible();
  });

  for (const { cp, scenario, credentials } of invalidLogins) {
    test(`${cp} muestra el error genérico con ${scenario}`, async ({ page, users }) => {
      const t = await localize("en");
      await submitCredentials(page, await credentials(users));

      await expect(page.getByText(t("incorrect_email_password"))).toBeVisible();
    });
  }

  for (const { cp, scenario, credentials } of invalidLogins.filter((login) => login.checksSession)) {
    test(`${cp} no crea sesión con ${scenario}`, async ({ page, users }) => {
      await submitCredentials(page, await credentials(users));
      await page.goto("/event-types");

      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }

  test("CP-07 muestra el error de formato con un correo inválido", async ({ page }) => {
    const t = await localize("en");
    await fillLoginForm(page, { email: "usuario.com", password: "cualquiera" });
    await clickLoginSubmit(page);

    await expect(loginFieldError(page, "#email")).toHaveText(t("enter_valid_email"));
  });

  test("CP-07 no envía la petición con un correo inválido", async ({ page }) => {
    const credentialRequests: string[] = [];
    page.on("request", (request) => {
      if (isCredentialsRequest(request.url())) credentialRequests.push(request.url());
    });
    await fillLoginForm(page, { email: "usuario.com", password: "cualquiera" });
    await clickLoginSubmit(page);
    // El error de campo marca que la validación terminó; antes, la lista vacía no probaría nada.
    await loginFieldError(page, "#email").waitFor();

    expect(credentialRequests).toHaveLength(0);
  });

  for (const { name, selector } of requiredFields) {
    test(`CP-08 exige el campo ${name}`, async ({ page }) => {
      const t = await localize("en");
      await clickLoginSubmit(page);

      await expect(loginFieldError(page, selector)).toHaveText(t("error_required_field"));
    });
  }
});
