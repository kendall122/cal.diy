import { expect } from "@playwright/test";
import { localize } from "../../lib/localize";
import { test } from "../lib/qa-test";
import {
  cancelFromBookingPage,
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  type EventTypeRef,
  futureWeekday,
  hostTime,
  openBookingDay,
  retryOnBusyDatabase,
  THURSDAY,
} from "../lib/reservas";

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-12 Cancelación de reservas", () => {
  const thursday = futureWeekday(THURSDAY, 1);
  const slot = hostTime(thursday, "11:00");
  let username: string;
  let hostLogin: (url: string) => Promise<void>;
  let directEvent: EventTypeRef;
  let pendingEvent: EventTypeRef;

  async function cancelFromPanel(page: import("@playwright/test").Page): Promise<void> {
    await hostLogin("/bookings/upcoming");
    await page.locator("[data-testid=booking-actions-dropdown]").first().click();
    await page.locator("[data-testid=cancel]").click();
    await page.locator("[data-testid=cancel_reason]").fill("Prueba QA");
    const cancelled = page.waitForResponse("**/api/cancel");
    await page.locator("[data-testid=confirm_cancel]").click();
    await cancelled;
  }

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    username = host.username ?? "";
    hostLogin = async (url) => {
      await host.apiLogin(url);
    };
    await configureHostAvailability(prisma, host.id);
    directEvent = await createEventType(prisma, host.id, "qa-cancela");
    pendingEvent = await createEventType(prisma, host.id, "qa-cancela-pendiente", {
      requiresConfirmation: true,
    });
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-39 deja cancelada la reserva desde el panel", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, directEvent, slot);
    await cancelFromPanel(page);
    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });

    expect(status).toBe("CANCELLED");
  });

  test("CP-39 libera el horario cancelado desde el panel", async ({ page, request }) => {
    await createBookingByApi(request, directEvent, slot);
    await cancelFromPanel(page);
    const slots = await openBookingDay(page, `/${username}/${directEvent.slug}`, thursday);

    expect(slots).toContain(slot);
  });

  test("CP-40 permite al invitado cancelar una reserva pendiente", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, pendingEvent, slot);
    await cancelFromBookingPage(page, booking.uid);
    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });

    expect(status).toBe("CANCELLED");
  });

  test("CP-40 libera el horario de la reserva pendiente cancelada", async ({ page, request }) => {
    const booking = await createBookingByApi(request, pendingEvent, slot);
    await cancelFromBookingPage(page, booking.uid);
    const slots = await openBookingDay(page, `/${username}/${pendingEvent.slug}`, thursday);

    expect(slots).toContain(slot);
  });

  test("CP-41 informa que la reserva ya está cancelada", async ({ page, request }) => {
    const t = await localize("en");
    const booking = await createBookingByApi(request, directEvent, slot);
    await cancelFromBookingPage(page, booking.uid);
    await page.goto(`/booking/${booking.uid}`);

    await expect(page.locator("[data-testid=cancelled-headline]")).toHaveText(t("event_cancelled"));
  });
});
