import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  bookingBody,
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  type EventTypeRef,
  futureWeekday,
  hostTime,
  openBookingDay,
  rescheduleFromPage,
  retryOnBusyDatabase,
  TUESDAY,
} from "../lib/reservas";

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-13 Reprogramación de reservas", () => {
  const tuesday = futureWeekday(TUESDAY, 1);
  const originalSlot = hostTime(tuesday, "13:00");
  const newSlot = hostTime(tuesday, "14:00");
  let eventType: EventTypeRef;
  let bookingPath: string;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    eventType = await createEventType(prisma, host.id, "qa-reprograma");
    bookingPath = `/${host.username}/${eventType.slug}`;
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-42 guarda la nueva fecha y hora", async ({ page, prisma, request }) => {
    const booking = await createBookingByApi(request, eventType, originalSlot);
    await rescheduleFromPage(page, booking.uid, tuesday, newSlot);
    const uid = new URL(page.url()).pathname.split("/").pop() ?? "";
    const { startTime } = await prisma.booking.findUniqueOrThrow({
      where: { uid },
      select: { startTime: true },
    });

    expect(startTime.toISOString()).toBe(newSlot);
  });

  test("CP-42 libera el horario anterior", async ({ page, request }) => {
    const booking = await createBookingByApi(request, eventType, originalSlot);
    await rescheduleFromPage(page, booking.uid, tuesday, newSlot);
    const slots = await openBookingDay(page, bookingPath, tuesday);

    expect(slots).toContain(originalSlot);
  });

  test("CP-43 rechaza reprogramar a un horario ocupado", async ({ request }) => {
    const original = await createBookingByApi(request, eventType, originalSlot);
    await createBookingByApi(request, eventType, newSlot, { name: "Otro Invitado", email: "otro@test.com" });
    const response = await request.post("/api/book/event", {
      data: { ...bookingBody(eventType, newSlot), rescheduleUid: original.uid },
    });

    expect(response.status()).toBe(409);
  });

  test("CP-43 conserva intacta la reserva original", async ({ prisma, request }) => {
    const original = await createBookingByApi(request, eventType, originalSlot);
    await createBookingByApi(request, eventType, newSlot, { name: "Otro Invitado", email: "otro@test.com" });
    await request.post("/api/book/event", {
      data: { ...bookingBody(eventType, newSlot), rescheduleUid: original.uid },
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: original.id },
      select: { status: true, startTime: true },
    });

    expect({ status: booking.status, startTime: booking.startTime.toISOString() }).toEqual({
      status: "ACCEPTED",
      startTime: originalSlot,
    });
  });
});
