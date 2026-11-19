import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  futureWeekday,
  hostTime,
  openBookingDay,
  retryOnBusyDatabase,
  TUESDAY,
} from "../lib/reservas";

const slotExpectations = [
  { cp: "CP-22", buffer: 15, time: "9:30", value: "09:30", offered: false },
  { cp: "CP-22", buffer: 15, time: "10:30", value: "10:30", offered: false },
  { cp: "CP-22", buffer: 15, time: "9:00", value: "09:00", offered: true },
  { cp: "CP-22", buffer: 15, time: "11:00", value: "11:00", offered: true },
  { cp: "CP-23", buffer: 0, time: "9:30", value: "09:30", offered: true },
  { cp: "CP-23", buffer: 0, time: "10:30", value: "10:30", offered: true },
];

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-07 Tiempo de amortiguación", () => {
  const tuesday = futureWeekday(TUESDAY);
  let hostId: number;
  let bookingPath: string;

  async function prepareBuffer(
    prisma: Parameters<typeof configureHostAvailability>[0],
    request: Parameters<typeof createBookingByApi>[0],
    buffer: number
  ): Promise<void> {
    const eventType = await createEventType(prisma, hostId, "qa-buffer");
    await createBookingByApi(request, eventType, hostTime(tuesday, "10:00"));
    // Se aplica después de reservar para que el propio buffer no bloquee la reserva de preparación.
    await prisma.eventType.update({
      where: { id: eventType.id },
      data: { beforeEventBuffer: buffer, afterEventBuffer: buffer },
      select: { id: true },
    });
  }

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    hostId = host.id;
    bookingPath = `/${host.username}/qa-buffer`;
    await configureHostAvailability(prisma, host.id);
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  for (const { cp, buffer, time, value, offered } of slotExpectations) {
    test(`${cp} con buffer ${buffer} ${offered ? "ofrece" : "bloquea"} las ${time}`, async ({
      page,
      prisma,
      request,
    }) => {
      await prepareBuffer(prisma, request, buffer);
      const slots = await openBookingDay(page, bookingPath, tuesday);

      expect(slots.includes(hostTime(tuesday, value))).toBe(offered);
    });
  }

  test("CP-24 con buffer de 120 el primer horario es 14:30", async ({ page, prisma, request }) => {
    await prepareBuffer(prisma, request, 120);
    const slots = await openBookingDay(page, bookingPath, tuesday);

    expect(slots[0]).toBe(hostTime(tuesday, "14:30"));
  });
});
