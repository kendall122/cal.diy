import type { Locator, Page } from "@playwright/test";

const CREDENTIALS_CALLBACK = /\/api\/auth\/callback\/credentials/;

export type LoginCredentials = {
  email: string;
  password: string;
};

export function loginForm(page: Page): Locator {
  return page.locator("[data-testid=login-form]");
}

export function loginFieldError(page: Page, fieldSelector: "#email" | "#password"): Locator {
  return loginForm(page)
    .locator("[data-slot=field]")
    .filter({ has: page.locator(fieldSelector) })
    .locator("[data-testid=field-error]");
}

export async function fillLoginForm(page: Page, { email, password }: LoginCredentials): Promise<void> {
  const form = loginForm(page);
  await form.locator("#email").fill(email);
  await form.locator("#password").fill(password);
}

export async function clickLoginSubmit(page: Page): Promise<void> {
  await loginForm(page).locator('[type="submit"]').click();
}

export async function submitCredentials(page: Page, credentials: LoginCredentials): Promise<void> {
  await fillLoginForm(page, credentials);
  const response = page.waitForResponse(CREDENTIALS_CALLBACK);
  await clickLoginSubmit(page);
  await response;
}

export function isCredentialsRequest(url: string): boolean {
  return CREDENTIALS_CALLBACK.test(url);
}
