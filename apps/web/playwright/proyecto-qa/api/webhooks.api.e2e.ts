import { createHmac, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { captureEvidence, logEvidence, test } from "../lib/qa-test";
import { startWebhookReceiver } from "../lib/receptor-webhook";
import {
  bookingBody,
  configureHostAvailability,
  createBookingByApi,
  createEventType,
  DEFAULT_GUEST,
  type EventTypeRef,
  futureWeekday,
  hostTime,
  retryOnBusyDatabase,
  TUESDAY,
} from "../lib/reservas";

const SECRET = "secreto-qa";

test.describe.configure({ mode: "parallel" });

test.describe("US-16 Entrega de webhooks", () => {
  const tuesday = futureWeekday(TUESDAY, 2);
  const slot = hostTime(tuesday, "09:00");
  const newSlot = hostTime(tuesday, "11:00");
  let receiver: Awaited<ReturnType<typeof startWebhookReceiver>>;
  let eventType: EventTypeRef;

  test.beforeEach(async ({ users, prisma }) => {
    receiver = await startWebhookReceiver();
    const host = await retryOnBusyDatabase(() => users.create());
    await configureHostAvailability(prisma, host.id);
    eventType = await createEventType(prisma, host.id, "qa-webhook");
    await prisma.webhook.create({
      data: {
        id: randomUUID(),
        userId: host.id,
        subscriberUrl: receiver.url,
        secret: SECRET,
        active: true,
        eventTriggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"],
      },
      select: { id: true },
    });
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await receiver.close();
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-55 envía BOOKING_CREATED con el invitado correcto", async ({ request }) => {
    await createBookingByApi(request, eventType, slot);
    const webhook = await receiver.waitForEvent("BOOKING_CREATED");
    logEvidence(test.info(), {
      method: "WEBHOOK",
      target: "BOOKING_CREATED",
      status: "recibido",
      detail: webhook.rawBody,
    });

    expect(webhook.payload.attendees?.[0]?.email).toBe(DEFAULT_GUEST.email);
  });

  test("CP-56 envía BOOKING_CANCELLED al cancelar", async ({ page, request }) => {
    const booking = await createBookingByApi(request, eventType, slot);
    await page.goto(`/booking/${booking.uid}?cancel=true`);
    await page.locator("[data-testid=cancel_reason]").fill("Prueba QA");
    await page.locator("[data-testid=confirm_cancel]").click();
    const webhook = await receiver.waitForEvent("BOOKING_CANCELLED");
    logEvidence(test.info(), {
      method: "WEBHOOK",
      target: "BOOKING_CANCELLED",
      status: "recibido",
      detail: webhook.rawBody,
    });

    expect(webhook.triggerEvent).toBe("BOOKING_CANCELLED");
  });

  test("CP-57 envía BOOKING_RESCHEDULED con la nueva hora", async ({ request }) => {
    const booking = await createBookingByApi(request, eventType, slot);
    await request.post("/api/book/event", {
      data: { ...bookingBody(eventType, newSlot), rescheduleUid: booking.uid },
    });
    const webhook = await receiver.waitForEvent("BOOKING_RESCHEDULED");
    logEvidence(test.info(), {
      method: "WEBHOOK",
      target: "BOOKING_RESCHEDULED",
      status: "recibido",
      detail: webhook.rawBody,
    });

    expect(webhook.payload.startTime).toBe(newSlot.replace(".000Z", "Z"));
  });

  test("CP-58 firma el webhook con el secreto configurado", async ({ request }) => {
    await createBookingByApi(request, eventType, slot);
    const webhook = await receiver.waitForEvent("BOOKING_CREATED");
    logEvidence(test.info(), {
      method: "WEBHOOK",
      target: "BOOKING_CREATED",
      status: "recibido",
      detail: webhook.rawBody,
    });
    const expectedSignature = createHmac("sha256", SECRET).update(webhook.rawBody).digest("hex");

    expect(webhook.signature).toBe(expectedSignature);
  });
});
