import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import {
  ALL_DAY,
  addDays,
  configureHostAvailability,
  createEventType,
  hostToday,
  openBookingDay,
  retryOnBusyDatabase,
  toDateKey,
} from "../lib/reservas";

const SLOT_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
const COSTA_RICA_OFFSET_MS = 6 * 3_600_000;
// El margen evita que el límite de 24 h cruce un horario mientras corre la prueba.
const CLOCK_MARGIN_MS = 2 * 60_000;

function hostDateKey(time: number): string {
  return new Date(time - COSTA_RICA_OFFSET_MS).toISOString().slice(0, 10);
}

const noticeCases = [
  {
    cp: "CP-30",
    name: "no ofrece el último horario antes de cumplir 24 h",
    offered: false,
    slotTime: (limit: number) => Math.floor((limit - 1) / SLOT_MS) * SLOT_MS,
  },
  {
    cp: "CP-31",
    name: "ofrece el primer horario después de cumplir 24 h",
    offered: true,
    slotTime: (limit: number) => Math.ceil((limit + CLOCK_MARGIN_MS) / SLOT_MS) * SLOT_MS,
  },
];

const windowCases = [
  { cp: "CP-32", day: 30, offered: true },
  { cp: "CP-33", day: 31, offered: false },
];

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-09 Ventana de reserva", () => {
  let bookingPath: string;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id, ALL_DAY);
    const eventType = await createEventType(prisma, host.id, "qa-ventana", {
      minimumBookingNotice: 1440,
      periodType: "ROLLING",
      periodDays: 30,
      periodCountCalendarDays: true,
    });
    bookingPath = `/${host.username}/${eventType.slug}`;
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  for (const { cp, name, offered, slotTime } of noticeCases) {
    test(`${cp} ${name}`, async ({ page }) => {
      const slot = slotTime(Date.now() + DAY_MS);
      const slots = await openBookingDay(page, bookingPath, hostDateKey(slot));

      expect(slots.includes(new Date(slot).toISOString())).toBe(offered);
    });
  }

  for (const { cp, day, offered } of windowCases) {
    test(`${cp} ${offered ? "ofrece" : "no ofrece"} horarios el día ${day}`, async ({ page }) => {
      const slots = await openBookingDay(page, bookingPath, toDateKey(addDays(hostToday(), day)));

      expect(slots.length > 0).toBe(offered);
    });
  }
});
