import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  bookSlotFromPage,
  cancelFromBookingPage,
  configureHostAvailability,
  futureWeekday,
  hostTime,
  retryOnBusyDatabase,
  TUESDAY,
} from "../lib/reservas";

test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-10 Flujo completo de reserva", () => {
  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-62 crea, confirma y cancela una reserva", async ({ page, users, prisma }) => {
    const tuesday = futureWeekday(TUESDAY, 3);
    const slot = hostTime(tuesday, "09:00");
    const slug = "qa-humo";
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    await host.apiLogin("/event-types");
    let bookingUid = "";

    await test.step("El anfitrión crea un evento con confirmación", async () => {
      await page.locator("[data-testid=new-event-type]:visible").click();
      await page.locator("input[name=title]").fill("QA humo");
      await page.locator("input[name=slug]").fill(slug);
      await page.locator("input[name=length]").fill("30");
      await page.getByRole("dialog").locator("button[type=submit]").click();
      await page.waitForURL(/\/event-types\/\d+/);
      await prisma.eventType.updateMany({
        where: { userId: host.id, slug },
        data: { requiresConfirmation: true },
      });
    });

    await test.step("El invitado reserva", async () => {
      await bookSlotFromPage(page, `/${host.username}/${slug}`, tuesday, slot);
      bookingUid = new URL(page.url()).pathname.split("/").pop() ?? "";
    });

    await test.step("El anfitrión confirma", async () => {
      await page.goto("/bookings/unconfirmed");
      const confirmed = page.waitForResponse("**/api/trpc/bookings/confirm**");
      await page.locator("[data-testid=confirm]").first().click();
      await confirmed;
    });

    await test.step("La reserva se cancela", async () => {
      await cancelFromBookingPage(page, bookingUid);
    });

    const { status } = await prisma.booking.findUniqueOrThrow({
      where: { uid: bookingUid },
      select: { status: true },
    });
    expect(status).toBe("CANCELLED");
  });
});
