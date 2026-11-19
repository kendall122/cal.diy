import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { addDays, createEventType, hostToday, plusMinutes, retryOnBusyDatabase } from "../lib/reservas";

const BOOKINGS = {
  upcoming: { title: "QA próxima", status: "ACCEPTED", dayOffset: 7 },
  unconfirmed: { title: "QA pendiente", status: "PENDING", dayOffset: 8 },
  past: { title: "QA pasada", status: "ACCEPTED", dayOffset: -7 },
  cancelled: { title: "QA cancelada", status: "CANCELLED", dayOffset: 9 },
} as const;

type BookingKey = keyof typeof BOOKINGS;

const dashboardCases: { key: BookingKey; route: string; name: string }[] = [
  { key: "upcoming", route: "upcoming", name: "confirmada" },
  { key: "unconfirmed", route: "unconfirmed", name: "pendiente" },
];
const filterCases: { key: BookingKey; route: string; name: string }[] = [
  { key: "unconfirmed", route: "unconfirmed", name: "Unconfirmed" },
  { key: "past", route: "past", name: "Past" },
  { key: "cancelled", route: "cancelled", name: "Canceled" },
];
const fullListCases: { key: BookingKey; route: string; name: string }[] = [
  { key: "upcoming", route: "upcoming", name: "futura" },
  { key: "past", route: "past", name: "pasada" },
  { key: "cancelled", route: "cancelled", name: "cancelada" },
];

async function visibleBookingTitles(page: Page, route: string): Promise<string[]> {
  await page.goto(`/bookings/${route}`);
  await page.locator("[data-testid=booking-item]").first().waitFor();
  const text = (await page.locator("[data-testid=booking-item]").allInnerTexts()).join("\n");
  return Object.values(BOOKINGS)
    .map(({ title }) => title)
    .filter((title) => text.includes(title));
}

test.describe.configure({ mode: "parallel" });

test.describe("US-14 y US-15 Panel de reservas", () => {
  test.beforeEach(async ({ users, bookings, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    const eventType = await createEventType(prisma, host.id, "qa-panel");
    for (const { title, status, dayOffset } of Object.values(BOOKINGS)) {
      const start = addDays(hostToday(), dayOffset);
      start.setUTCHours(16);
      await retryOnBusyDatabase(() =>
        bookings.create(host.id, host.username, eventType.id, {
          title,
          status,
          startTime: start,
          endTime: new Date(plusMinutes(start.toISOString(), 30)),
        })
      );
    }
    await host.apiLogin("/bookings/upcoming");
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  for (const { key, route, name } of dashboardCases) {
    test(`CP-44 muestra la información de la reserva ${name}`, async ({ page }) => {
      await page.goto(`/bookings/${route}`);

      await expect(
        page.locator("[data-testid=booking-item]").filter({ hasText: BOOKINGS[key].title })
      ).toBeVisible();
    });
  }

  for (const { key, route, name } of filterCases) {
    test(`CP-45 el filtro ${name} muestra solo su categoría`, async ({ page }) => {
      const titles = await visibleBookingTitles(page, route);

      expect(titles).toEqual([BOOKINGS[key].title]);
    });
  }

  for (const { key, route, name } of fullListCases) {
    test(`CP-46 lista la reserva ${name}`, async ({ page }) => {
      const titles = await visibleBookingTitles(page, route);

      expect(titles).toContain(BOOKINGS[key].title);
    });
  }
});
