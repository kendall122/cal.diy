import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  bookingBody,
  configureHostAvailability,
  createEventType,
  type EventTypeRef,
  futureWeekday,
  hostTime,
  retryOnBusyDatabase,
  THURSDAY,
} from "../lib/reservas";

test.describe.configure({ mode: "parallel" });

test.describe("US-10 API de reservas", () => {
  const thursday = futureWeekday(THURSDAY, 2);
  const slot = hostTime(thursday, "15:00");
  let eventType: EventTypeRef;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    eventType = await createEventType(prisma, host.id, "qa-api");
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  const invalidBody = (id: number) => ({
    eventTypeId: id,
    timeZone: "America/Costa_Rica",
    language: "en",
    metadata: {},
    responses: { name: "Invitado QA" },
  });

  test("CP-50 responde HTTP 400 sin correo ni horario", async ({ request }) => {
    const response = await request.post("/api/book/event", { data: invalidBody(eventType.id) });

    expect(response.status()).toBe(400);
  });

  test("CP-50 detalla los campos inválidos", async ({ request }) => {
    const response = await request.post("/api/book/event", { data: invalidBody(eventType.id) });
    const { message } = await response.json();

    expect(message).toMatch(/start[\s\S]*email/);
  });

  test("CP-50 no registra la reserva", async ({ prisma, request }) => {
    await request.post("/api/book/event", { data: invalidBody(eventType.id) });
    const saved = await prisma.booking.count({ where: { eventTypeId: eventType.id } });

    expect(saved).toBe(0);
  });

  async function sendSimultaneousBookings(request: import("@playwright/test").APIRequestContext) {
    const data = bookingBody(eventType, slot);
    return Promise.all([
      request.post("/api/book/event", { data }),
      request.post("/api/book/event", { data }),
    ]);
  }

  test("CP-51 acepta una reserva y rechaza la otra con HTTP 409", async ({ request }) => {
    const responses = await sendSimultaneousBookings(request);
    const statuses = responses.map((response) => response.status()).sort();

    expect(statuses).toEqual([200, 409]);
  });

  test("CP-51 crea una sola reserva en el horario", async ({ prisma, request }) => {
    await sendSimultaneousBookings(request);
    const saved = await prisma.booking.count({
      where: { eventTypeId: eventType.id, startTime: new Date(slot), status: "ACCEPTED" },
    });

    expect(saved).toBe(1);
  });
});
