import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { localize } from "../../lib/localize";
import {
  configureHostAvailability,
  createEventType,
  DEFAULT_GUEST,
  fillGuestForm,
  futureWeekday,
  hostTime,
  openBookingDay,
  retryOnBusyDatabase,
  slotButton,
  submitGuestForm,
  TUESDAY,
} from "../lib/reservas";

const invalidGuests = [
  {
    cp: "CP-35",
    name: "un correo inválido",
    guest: { ...DEFAULT_GUEST, email: "invitado@" },
    messageKey: "email_validation_error",
  },
  {
    cp: "CP-36",
    name: "el nombre vacío",
    guest: { ...DEFAULT_GUEST, name: "" },
    messageKey: "error_required_field",
  },
];

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-10 Formulario de reserva", () => {
  const tuesday = futureWeekday(TUESDAY);

  test.beforeEach(async ({ page, users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    const eventType = await createEventType(prisma, host.id, "qa-formulario");
    await openBookingDay(page, `/${host.username}/${eventType.slug}`, tuesday);
    await slotButton(page, hostTime(tuesday, "09:00")).click();
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-34 crea la reserva con datos válidos", async ({ page }) => {
    await fillGuestForm(page, DEFAULT_GUEST);
    await submitGuestForm(page);
    await page.waitForURL("**/booking/**");

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  for (const { cp, name, guest, messageKey } of invalidGuests) {
    test(`${cp} rechaza ${name}`, async ({ page }) => {
      const t = await localize("en");
      await fillGuestForm(page, guest);
      await page.locator("[data-testid=confirm-book-button]").click();

      await expect(page.getByText(t(messageKey))).toBeVisible({ timeout: 15_000 });
    });
  }
});
