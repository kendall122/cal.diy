import type { Prisma } from "@calcom/prisma/client";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Fixtures } from "../../lib/fixtures";

type QaPrisma = Fixtures["prisma"];
type EventTypeOverrides = Partial<
  Pick<
    Prisma.EventTypeUncheckedCreateInput,
    | "title"
    | "requiresConfirmation"
    | "minimumBookingNotice"
    | "periodType"
    | "periodDays"
    | "periodCountCalendarDays"
  >
>;

export type AvailabilityWindow = {
  days: number[];
  startTime: string;
  endTime: string;
};

export type GuestData = {
  name: string;
  email: string;
};

export type EventTypeRef = {
  id: number;
  slug: string;
  length: number;
};

export const HOST_TIME_ZONE = "America/Costa_Rica";
export const TUESDAY = 2;
export const THURSDAY = 4;
export const MONDAY = 1;
export const WORKING_DAYS: AvailabilityWindow = {
  days: [TUESDAY, THURSDAY],
  startTime: "09:00",
  endTime: "17:00",
};
export const ALL_DAY: AvailabilityWindow = {
  days: [0, 1, 2, 3, 4, 5, 6],
  startTime: "00:00",
  endTime: "23:59",
};
export const DEFAULT_GUEST: GuestData = { name: "Invitado Prueba", email: "invitado@test.com" };

const COSTA_RICA_UTC_OFFSET_HOURS = 6;
const DAY_MS = 86_400_000;
const BUSY_DATABASE_RETRIES = 4;

function isBusyDatabaseError(error: unknown): boolean {
  return (
    error instanceof Error && /Transaction API error|P2028|Unable to start a transaction/.test(error.message)
  );
}

// Con varias pruebas en paralelo, Prisma puede agotar su espera de 5 s al crear o borrar datos de apoyo.
export async function retryOnBusyDatabase<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= BUSY_DATABASE_RETRIES || !isBusyDatabaseError(error)) throw error;
    }
  }
}

// El servidor puede cerrar una conexión reutilizada justo cuando se prepara el dato de apoyo.
async function retryOnConnectionReset<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNRESET")) return action();
    throw error;
  }
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function hostToday(): Date {
  const hostNow = new Date(Date.now() - COSTA_RICA_UTC_OFFSET_HOURS * 3_600_000);
  return new Date(Date.UTC(hostNow.getUTCFullYear(), hostNow.getUTCMonth(), hostNow.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// Se parte de varios días adelante para que el aviso mínimo por defecto no afecte los horarios.
export function futureWeekday(weekday: number, weeksAhead = 0): string {
  const start = addDays(hostToday(), 3);
  const offset = (weekday - start.getUTCDay() + 7) % 7;
  return toDateKey(addDays(start, offset + weeksAhead * 7));
}

export function hostTime(dateKey: string, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCHours(hours + COSTA_RICA_UTC_OFFSET_HOURS, minutes);
  return date.toISOString();
}

export function plusMinutes(isoTime: string, minutes: number): string {
  return new Date(new Date(isoTime).getTime() + minutes * 60_000).toISOString();
}

export async function configureHostAvailability(
  prisma: QaPrisma,
  userId: number,
  { days, startTime, endTime }: AvailabilityWindow = WORKING_DAYS
): Promise<number> {
  const schedule = await prisma.schedule.findFirstOrThrow({ where: { userId }, select: { id: true } });
  await retryOnBusyDatabase(() =>
    prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { timeZone: HOST_TIME_ZONE, defaultScheduleId: schedule.id },
        select: { id: true },
      }),
      prisma.schedule.update({
        where: { id: schedule.id },
        data: { timeZone: HOST_TIME_ZONE },
        select: { id: true },
      }),
      prisma.availability.deleteMany({ where: { scheduleId: schedule.id } }),
      prisma.availability.create({
        data: {
          scheduleId: schedule.id,
          days,
          startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
          endTime: new Date(`1970-01-01T${endTime}:00.000Z`),
        },
        select: { id: true },
      }),
    ])
  );
  return schedule.id;
}

export async function createEventType(
  prisma: QaPrisma,
  userId: number,
  slug: string,
  overrides: EventTypeOverrides = {}
): Promise<EventTypeRef> {
  return retryOnBusyDatabase(() =>
    prisma.eventType.create({
      data: {
        title: `Evento ${slug}`,
        slug,
        length: 30,
        locations: [{ type: "integrations:daily" }],
        owner: { connect: { id: userId } },
        users: { connect: { id: userId } },
        ...overrides,
      },
      select: { id: true, slug: true, length: true },
    })
  );
}

export function bookingBody(eventType: EventTypeRef, start: string, guest: GuestData = DEFAULT_GUEST) {
  return {
    eventTypeId: eventType.id,
    start,
    end: plusMinutes(start, eventType.length),
    timeZone: HOST_TIME_ZONE,
    language: "en",
    metadata: {},
    responses: { ...guest, location: { value: "integrations:daily", optionValue: "" } },
  };
}

export async function createBookingByApi(
  request: APIRequestContext,
  eventType: EventTypeRef,
  start: string,
  guest: GuestData = DEFAULT_GUEST
): Promise<{ id: number; uid: string }> {
  const response = await retryOnConnectionReset(() =>
    request.post("/api/book/event", { data: bookingBody(eventType, start, guest) })
  );
  if (!response.ok()) {
    throw new Error(`No se pudo preparar la reserva: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

async function fetchDaySlotCount(page: Page, path: string, dateKey: string): Promise<number> {
  const [, username, eventTypeSlug] = path.split("?")[0].split("/");
  const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const day = new Date(`${dateKey}T00:00:00.000Z`);
  const input = {
    0: {
      json: {
        usernameList: [username],
        eventTypeSlug,
        startTime: addDays(day, -1).toISOString(),
        endTime: addDays(day, 2).toISOString(),
        timeZone,
        isTeamEvent: false,
        orgSlug: null,
      },
    },
  };
  const response = await page.request.get(
    `/api/trpc/slots/getSchedule?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
  );
  const body = await response.json();
  return body[0].result.data.json.slots[dateKey]?.length ?? 0;
}

// La página puede traer los horarios desde el servidor, así que no siempre hay una petición que esperar.
export async function openBookingDay(page: Page, path: string, dateKey: string): Promise<string[]> {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("date", dateKey);
  url.searchParams.set("month", dateKey.slice(0, 7));
  await page.goto(`${url.pathname}${url.search}`);
  await page.locator("[data-testid=day]").first().waitFor();
  if ((await fetchDaySlotCount(page, url.pathname, dateKey)) === 0) return [];
  await page.locator("[data-testid=time]").first().waitFor();
  return page
    .locator("[data-testid=time]")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-time") ?? ""));
}

export function slotButton(page: Page, isoTime: string) {
  return page.locator(`[data-testid=time][data-time="${isoTime}"]`);
}

export async function fillGuestForm(page: Page, { name, email }: GuestData): Promise<void> {
  await page.locator('[name="name"]').fill(name);
  await page.locator('[name="email"]').fill(email);
}

export async function submitGuestForm(page: Page): Promise<void> {
  const response = page.waitForResponse("**/api/book/event");
  await page.locator("[data-testid=confirm-book-button]").click();
  await response;
}

export async function bookSlotFromPage(
  page: Page,
  path: string,
  dateKey: string,
  isoTime: string,
  guest: GuestData = DEFAULT_GUEST
): Promise<void> {
  await openBookingDay(page, path, dateKey);
  await slotButton(page, isoTime).click();
  await fillGuestForm(page, guest);
  await submitGuestForm(page);
  await page.waitForURL("**/booking/**");
}

export async function cancelFromBookingPage(page: Page, uid: string): Promise<void> {
  await page.goto(`/booking/${uid}?cancel=true`);
  await page.locator("[data-testid=cancel_reason]").fill("Prueba QA");
  await page.locator("[data-testid=confirm_cancel]").click();
  await page.locator("[data-testid=cancelled-headline]").waitFor();
}

export async function rescheduleFromPage(
  page: Page,
  uid: string,
  dateKey: string,
  isoTime: string
): Promise<void> {
  await page.goto(`/reschedule/${uid}`);
  await page.waitForURL(/rescheduleUid=/);
  const current = new URL(page.url());
  await openBookingDay(page, `${current.pathname}${current.search}`, dateKey);
  await slotButton(page, isoTime).click();
  const response = page.waitForResponse("**/api/book/event");
  await page.locator("[data-testid=confirm-reschedule-button]").click();
  await response;
  await page.waitForURL("**/booking/**");
}
