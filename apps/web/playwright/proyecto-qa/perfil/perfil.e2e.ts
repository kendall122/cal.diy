import { slugify } from "@calcom/lib/slugify";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { localize } from "../../lib/localize";
import { submitAndWaitForResponse } from "../../lib/testUtils";
import { retryOnBusyDatabase } from "../lib/reservas";

const PROFILE_URL = "/settings/my-account/profile";
const GENERAL_URL = "/settings/my-account/general";
const UPDATE_PROFILE_API = "/api/trpc/me/updateProfile?batch=1";
const USERNAME_INPUT = "[data-testid=username-input]";
const UPDATE_USERNAME_BUTTON = "[data-testid=update-username-btn]:visible";
// El error al guardar aparece en segundos; no hace falta el límite global de 120 s.
const VISIBLE_MESSAGE_TIMEOUT = 15_000;

test.describe.configure({ mode: "parallel" });

test.describe("US-03 Perfil de usuario", () => {
  let userId: number;
  let originalUsername: string | null;

  test.beforeEach(async ({ users }) => {
    const user = await users.create();
    userId = user.id;
    originalUsername = user.username;
    await user.apiLogin(PROFILE_URL);
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-10 conserva el nombre tras recargar", async ({ page }) => {
    const name = "Nombre QA Editado";
    await page.locator("input[name=name]").fill(name);
    await submitAndWaitForResponse(page, UPDATE_PROFILE_API, {
      action: () => page.locator("[data-testid=profile-submit-button]").click(),
    });
    await page.reload();

    await expect(page.locator("input[name=name]")).toHaveValue(name);
  });

  test("CP-10 conserva el nombre de usuario tras recargar", async ({ page }, testInfo) => {
    const username = `qa-perfil-${testInfo.workerIndex}-${Date.now()}`;
    await page.locator(USERNAME_INPUT).fill(username);
    await page.locator(UPDATE_USERNAME_BUTTON).click();
    await submitAndWaitForResponse(page, UPDATE_PROFILE_API, {
      action: () => page.locator("[data-testid=save-username]").click(),
    });
    await page.reload();

    await expect(page.locator(USERNAME_INPUT)).toHaveValue(username);
  });

  test("CP-10 conserva la zona horaria tras recargar", async ({ page }) => {
    await page.goto(GENERAL_URL);
    await page.locator("#timezone input").first().fill("Costa Rica");
    await page.keyboard.press("Enter");
    await submitAndWaitForResponse(page, UPDATE_PROFILE_API, {
      action: () => page.locator("[data-testid=general-submit-button]:visible").click(),
    });
    await page.reload();

    await expect(page.getByText(/America\/Costa.Rica/).first()).toBeVisible();
  });

  async function tryToUseExistingUsername(page: Page, existingUsername: string): Promise<void> {
    await page.locator(USERNAME_INPUT).fill(existingUsername);
    await page.locator(UPDATE_USERNAME_BUTTON).click();
    const updateAttempt = page.waitForResponse(`**${UPDATE_PROFILE_API}`);
    await page.locator("[data-testid=save-username]").click();
    await updateAttempt;
  }

  test("CP-11 muestra un error al guardar un nombre de usuario existente", async ({ page, users }) => {
    const t = await localize("en");
    const otherUser = await retryOnBusyDatabase(() => users.create());
    await tryToUseExistingUsername(page, otherUser.username ?? "");

    await expect(page.getByText(t("error_updating_settings"))).toBeVisible({
      timeout: VISIBLE_MESSAGE_TIMEOUT,
    });
  });

  test("CP-11 conserva el nombre de usuario original", async ({ page, prisma, users }) => {
    const otherUser = await retryOnBusyDatabase(() => users.create());
    await tryToUseExistingUsername(page, otherUser.username ?? "");
    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true },
    });

    expect(savedUser.username).toBe(originalUsername);
  });

  test("CP-12 no permite guardar un nombre de usuario vacío", async ({ page }, testInfo) => {
    await page.locator(USERNAME_INPUT).fill(`qa-disponible-${testInfo.workerIndex}-${Date.now()}`);
    // El botón visible demuestra que el formulario reacciona antes de vaciar el campo.
    await page.locator(UPDATE_USERNAME_BUTTON).waitFor();
    await page.locator(USERNAME_INPUT).fill("");

    await expect(page.locator(UPDATE_USERNAME_BUTTON)).toHaveCount(0);
  });

  test("CP-12 normaliza los caracteres inválidos del nombre de usuario", async ({
    page,
    prisma,
  }, testInfo) => {
    // El sufijo mantiene único el valor, porque el nombre de usuario no puede repetirse.
    const rawUsername = `us er@# ${testInfo.workerIndex}${Date.now()}`;
    await page.locator(USERNAME_INPUT).fill(rawUsername);
    await page.locator(UPDATE_USERNAME_BUTTON).click();
    await submitAndWaitForResponse(page, UPDATE_PROFILE_API, {
      action: () => page.locator("[data-testid=save-username]").click(),
    });
    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true },
    });

    expect(savedUser.username).toBe(slugify(rawUsername));
  });
});
