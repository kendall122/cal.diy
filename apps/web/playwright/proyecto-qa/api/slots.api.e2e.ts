import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import {
  addDays,
  configureHostAvailability,
  createEventType,
  futureWeekday,
  hostTime,
  retryOnBusyDatabase,
  TUESDAY,
  toDateKey,
} from "../lib/reservas";

const THIRTY_MINUTES_MS = 30 * 60_000;

type SlotsByDay = Record<string, { time: string }[]>;

async function fetchSlots(
  request: APIRequestContext,
  username: string,
  dateKey: string,
  timeZone: string
): Promise<SlotsByDay> {
  const start = new Date(`${dateKey}T06:00:00.000Z`);
  const input = {
    0: {
      json: {
        usernameList: [username],
        eventTypeSlug: "qa-slots",
        startTime: start.toISOString(),
        endTime: new Date(addDays(start, 1).getTime() - 1000).toISOString(),
        timeZone,
        isTeamEvent: false,
        orgSlug: null,
      },
    },
  };
  const response = await request.get(
    `/api/trpc/slots/getSchedule?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
  );
  return (await response.json())[0].result.data.json.slots;
}

test.describe.configure({ mode: "parallel" });

test.describe("US-10 API de horarios", () => {
  const tuesday = futureWeekday(TUESDAY);
  let username: string;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    username = host.username ?? "";
    await configureHostAvailability(prisma, host.id);
    await createEventType(prisma, host.id, "qa-slots");
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-52 agrupa los horarios según la fecha de Tokio", async ({ request }) => {
    const slots = await fetchSlots(request, username, tuesday, "Asia/Tokyo");
    const tokyoDay = toDateKey(addDays(new Date(`${tuesday}T00:00:00.000Z`), 1));

    expect(slots[tokyoDay]?.[0]?.time).toBe(hostTime(tuesday, "09:00"));
  });

  test("CP-52 devuelve horarios sin solapamientos", async ({ request }) => {
    const slots = await fetchSlots(request, username, tuesday, "Asia/Tokyo");
    const times = Object.values(slots)
      .flat()
      .map(({ time }) => new Date(time).getTime())
      .sort((first, second) => first - second);
    const overlaps = times.filter((time, index) => index > 0 && time - times[index - 1] < THIRTY_MINUTES_MS);

    expect(overlaps).toEqual([]);
  });
});
