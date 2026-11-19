import { expect } from "@playwright/test";
import { localize } from "../../lib/localize";
import { test } from "../lib/qa-test";
import {
  bookSlotFromPage,
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  futureWeekday,
  hostTime,
  openBookingDay,
  retryOnBusyDatabase,
  THURSDAY,
} from "../lib/reservas";

type Prepared = {
  hostLogin: (url: string) => Promise<void>;
  pendingEvent: Awaited<ReturnType<typeof createEventType>>;
  directEvent: Awaited<ReturnType<typeof createEventType>>;
  username: string;
};

const CONFIRM_API = "**/api/trpc/bookings/confirm**";

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-08 Confirmación de reservas", () => {
  const thursday = futureWeekday(THURSDAY);
  const slot = hostTime(thursday, "09:00");
  let prepared: Prepared;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    prepared = {
      hostLogin: async (url) => {
        await host.apiLogin(url);
      },
      username: host.username ?? "",
      pendingEvent: await createEventType(prisma, host.id, "qa-confirma", {
        title: "QA con confirmación",
        requiresConfirmation: true,
      }),
      directEvent: await createEventType(prisma, host.id, "qa-directo", { title: "QA sin confirmación" }),
    };
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-25 informa que la reserva quedó enviada", async ({ page }) => {
    const t = await localize("en");
    await bookSlotFromPage(page, `/${prepared.username}/qa-confirma`, thursday, slot);

    await expect(page.getByText(t("booking_submitted"), { exact: true })).toBeVisible();
  });

  test("CP-25 muestra la reserva en Sin confirmar", async ({ page, request }) => {
    await createBookingByApi(request, prepared.pendingEvent, slot);
    await prepared.hostLogin("/bookings/unconfirmed");

    await expect(
      page.locator("[data-testid=booking-item]").filter({ hasText: "QA con confirmación" })
    ).toBeVisible();
  });

  test("CP-26 confirma automáticamente la reserva", async ({ page }) => {
    const t = await localize("en");
    await bookSlotFromPage(page, `/${prepared.username}/qa-directo`, thursday, slot);

    await expect(page.getByText(t("meeting_is_scheduled"), { exact: true })).toBeVisible();
  });

  test("CP-26 muestra la reserva en Próximas", async ({ page, request }) => {
    await createBookingByApi(request, prepared.directEvent, slot);
    await prepared.hostLogin("/bookings/upcoming");

    await expect(
      page.locator("[data-testid=booking-item]").filter({ hasText: "QA sin confirmación" })
    ).toBeVisible();
  });

  test("CP-27 confirma una reserva pendiente", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, prepared.pendingEvent, slot);
    await prepared.hostLogin("/bookings/unconfirmed");
    const confirmed = page.waitForResponse(CONFIRM_API);
    await page.locator("[data-testid=confirm]").first().click();
    await confirmed;
    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });

    expect(status).toBe("ACCEPTED");
  });

  async function rejectFromPanel(page: import("@playwright/test").Page): Promise<void> {
    await prepared.hostLogin("/bookings/unconfirmed");
    await page.locator("[data-testid=reject]").first().click();
    const rejected = page.waitForResponse(CONFIRM_API);
    await page.locator("[data-testid=rejection-confirm]").click();
    await rejected;
  }

  test("CP-28 deja rechazada la reserva", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, prepared.pendingEvent, slot);
    await rejectFromPanel(page);
    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });

    expect(status).toBe("REJECTED");
  });

  test("CP-28 libera el horario rechazado", async ({ page, request }) => {
    await createBookingByApi(request, prepared.pendingEvent, slot);
    await rejectFromPanel(page);
    const slots = await openBookingDay(page, `/${prepared.username}/qa-confirma`, thursday);

    expect(slots).toContain(slot);
  });

  test("CP-29 no permite confirmar una reserva cancelada", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, prepared.directEvent, slot);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
      select: { id: true },
    });
    await prepared.hostLogin("/bookings/cancelled");
    await page.request.post("/api/trpc/bookings/confirm?batch=1", {
      data: { 0: { json: { bookingId: booking.id, confirmed: true } } },
    });
    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true },
    });

    expect(status).toBe("CANCELLED");
  });
});
