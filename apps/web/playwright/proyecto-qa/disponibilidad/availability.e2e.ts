import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { submitAndWaitForResponse } from "../../lib/testUtils";
import {
  bookSlotFromPage,
  configureHostAvailability,
  createEventType,
  futureWeekday,
  hostTime,
  MONDAY,
  openBookingDay,
  retryOnBusyDatabase,
  THURSDAY,
  TUESDAY,
} from "../lib/reservas";

const closingSlots = [
  { time: "16:30", offered: true },
  { time: "17:00", offered: false },
];

function minutesFromLabel(label: string): number {
  // La lista puede usar formato de 12 o de 24 horas.
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) throw new Error(`Hora no reconocida: ${label}`);
  const baseHours = Number(match[1]);
  const period = match[3]?.toLowerCase();
  const hours = period ? (baseHours % 12) + (period === "pm" ? 12 : 0) : baseHours;
  return hours * 60 + Number(match[2]);
}

async function setTuesdayStartToFivePm(page: Page): Promise<void> {
  const tuesdayRow = page.locator("[data-testid=Tuesday]").first();
  const startInput = tuesdayRow.locator("input[role=combobox]").first();
  const fivePm = page.getByRole("option", { name: /^(5:00\s*pm|17:00)$/i });
  // La pantalla puede volver a renderizarse al cargar sus datos y cerrar la lista recién abierta.
  await page.waitForLoadState("networkidle");
  for (let attempt = 1; ; attempt += 1) {
    await startInput.click();
    try {
      await fivePm.click({ timeout: 3000 });
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      await page.keyboard.press("Escape");
    }
  }
  // Al mover el inicio después del fin, la pantalla ajusta el fin a inicio + 15 minutos.
  await tuesdayRow.getByText(/^(5:15\s*pm|17:15)$/i).waitFor();
}

test.describe.configure({ mode: "parallel" });
test.use({ timezoneId: "America/Costa_Rica" });

test.describe("US-06 Disponibilidad", () => {
  let bookingPath: string;
  let scheduleId: number;

  test.beforeEach(async ({ users, prisma }) => {
    const host = await retryOnBusyDatabase(() => users.create());
    scheduleId = await configureHostAvailability(prisma, host.id);
    const eventType = await createEventType(prisma, host.id, "qa-disponibilidad");
    bookingPath = `/${host.username}/${eventType.slug}`;
    await host.apiLogin("/availability");
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-18 crea una reserva dentro de la disponibilidad", async ({ page }) => {
    const tuesday = futureWeekday(TUESDAY);
    await bookSlotFromPage(page, bookingPath, tuesday, hostTime(tuesday, "10:00"));

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("CP-19 no ofrece horarios en un día no configurado", async ({ page }) => {
    const offered = await openBookingDay(page, bookingPath, futureWeekday(MONDAY));

    expect(offered).toEqual([]);
  });

  for (const { time, offered } of closingSlots) {
    test(`CP-20 ${offered ? "ofrece" : "no ofrece"} el horario de las ${time}`, async ({ page }) => {
      const thursday = futureWeekday(THURSDAY);
      const slots = await openBookingDay(page, bookingPath, thursday);

      expect(slots.includes(hostTime(thursday, time))).toBe(offered);
    });
  }

  test("CP-21 solo ofrece horas de fin posteriores al inicio", async ({ page }) => {
    await page.goto(`/availability/${scheduleId}`);
    const tuesdayRow = page.locator("[data-testid=Tuesday]").first();
    await setTuesdayStartToFivePm(page);
    await tuesdayRow.locator("input[role=combobox]").nth(1).click();
    await page.getByRole("option").first().waitFor();
    const endLabels = await page.getByRole("option").allInnerTexts();
    const earlierOptions = endLabels.filter((label) => minutesFromLabel(label) <= 17 * 60);

    expect(earlierOptions).toEqual([]);
  });

  test("CP-21 no guarda un rango con fin anterior al inicio", async ({ page, prisma }) => {
    await page.goto(`/availability/${scheduleId}`);
    const tuesdayRow = page.locator("[data-testid=Tuesday]").first();
    await setTuesdayStartToFivePm(page);
    await tuesdayRow.locator("input[role=combobox]").nth(1).fill("9:00");
    await page.keyboard.press("Enter");
    const saveButton = page.locator('[form="availability-form"][type="submit"]');
    // Con un rango inválido la pantalla puede desactivar Guardar; ambos caminos deben dejar la base sin ese rango.
    if (await saveButton.isEnabled()) {
      await submitAndWaitForResponse(page, "/api/trpc/availability/schedule.update?batch=1", {
        action: () => saveButton.click(),
      });
    }
    const ranges = await prisma.availability.findMany({
      where: { scheduleId },
      select: { startTime: true, endTime: true },
    });

    expect(ranges.filter(({ startTime, endTime }) => endTime <= startTime)).toEqual([]);
  });
});
