import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  futureWeekday,
  hostTime,
  retryOnBusyDatabase,
  TUESDAY,
} from "../lib/reservas";

const trpcQuery = (path: string, json: unknown) =>
  `/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json } }))}`;

test.describe.configure({ mode: "parallel" });

test.describe("US-02 y US-15 Control de acceso", () => {
  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-53 responde HTTP 401 sin sesión", async ({ request }) => {
    const response = await request.get(trpcQuery("me/get", {}));

    expect(response.status()).toBe(401);
  });

  test("CP-53 no expone datos sin sesión", async ({ request }) => {
    const response = await request.get(trpcQuery("me/get", {}));
    const [body] = await response.json();

    expect(body.result).toBeUndefined();
  });

  async function requestOtherUserBooking({
    users,
    prisma,
    request,
  }: Pick<Parameters<Parameters<typeof test>[2]>[0], "users" | "prisma" | "request">) {
    const owner = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, owner.id);
    const eventType = await createEventType(prisma, owner.id, "qa-acceso");
    const tuesday = futureWeekday(TUESDAY);
    const booking = await createBookingByApi(request, eventType, hostTime(tuesday, "09:00"), {
      name: "Invitado Privado",
      email: "invitado-privado@test.com",
    });
    const otherUser = await retryOnBusyDatabase(() => users.create());
    await otherUser.apiLogin("/event-types");
    return request.get(trpcQuery("bookings/getBookingDetails", { uid: booking.uid }));
  }

  test("CP-54 responde HTTP 403 o 404 con la reserva de otro usuario", async ({ users, prisma, request }) => {
    const response = await requestOtherUserBooking({ users, prisma, request });

    expect([403, 404]).toContain(response.status());
  });

  test("CP-54 no entrega datos de la reserva de otro usuario", async ({ users, prisma, request }) => {
    const response = await requestOtherUserBooking({ users, prisma, request });

    expect(await response.text()).not.toContain("invitado-privado@test.com");
  });
});
