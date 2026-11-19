import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import {
  ALL_DAY,
  addDays,
  bookSlotFromPage,
  configureHostAvailability,
  createEventType,
  futureWeekday,
  HOST_TIME_ZONE,
  hostTime,
  hostToday,
  openBookingDay,
  retryOnBusyDatabase,
  slotButton,
  TUESDAY,
  toDateKey,
} from "../lib/reservas";

function nextDstChangeDate(): string {
  const today = hostToday();
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const marchFirst = new Date(Date.UTC(year, 2, 1));
    const secondSunday = addDays(marchFirst, ((7 - marchFirst.getUTCDay()) % 7) + 7);
    if (secondSunday > today) return toDateKey(secondSunday);
  }
  throw new Error("No se encontró una fecha de cambio de horario");
}

test.describe.configure({ mode: "parallel" });

test.describe("US-10 Zonas horarias", () => {
  let username: string;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    username = host.username ?? "";
    await configureHostAvailability(prisma, host.id, ALL_DAY);
    await createEventType(prisma, host.id, "qa-zona");
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test.describe("invitado en Tokio", () => {
    test.use({ timezoneId: "Asia/Tokyo" });

    test("CP-37 muestra las 9:00 de Costa Rica como 0:00 del día siguiente", async ({ page }) => {
      const tuesday = futureWeekday(TUESDAY);
      const tokyoDay = toDateKey(addDays(new Date(`${tuesday}T00:00:00.000Z`), 1));
      await openBookingDay(page, `/${username}/qa-zona`, tokyoDay);

      await expect(slotButton(page, hostTime(tuesday, "09:00"))).toHaveText(/12:00\s*am/i);
    });
  });

  test.describe("invitado en Nueva York", () => {
    test.use({ timezoneId: "America/New_York" });

    test("CP-38 muestra la hora correcta tras el cambio de horario", async ({ page }) => {
      const dstDay = nextDstChangeDate();
      await openBookingDay(page, `/${username}/qa-zona`, dstDay);

      await expect(slotButton(page, hostTime(dstDay, "09:00"))).toHaveText(/11:00\s*am/i);
    });

    test("CP-38 guarda la reserva a las 9:00 de Costa Rica", async ({ page, prisma }) => {
      const dstDay = nextDstChangeDate();
      const slot = hostTime(dstDay, "09:00");
      await bookSlotFromPage(page, `/${username}/qa-zona`, dstDay, slot);
      const uid = new URL(page.url()).pathname.split("/").pop() ?? "";
      const { startTime } = await prisma.booking.findUniqueOrThrow({
        where: { uid },
        select: { startTime: true },
      });
      const hostClock = new Intl.DateTimeFormat("en-GB", {
        timeZone: HOST_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(startTime);

      expect(hostClock).toBe("09:00");
    });
  });
});
