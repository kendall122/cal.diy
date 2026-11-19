import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { captureEvidence, test } from "../lib/qa-test";
import { retryOnBusyDatabase } from "../lib/reservas";

type EventTypeForm = {
  title: string;
  slug: string;
  length: string;
};

const CREATE_API = "**/api/trpc/eventTypesHeavy/create**";
const VISIBLE_MESSAGE_TIMEOUT = 15_000;
const INVALID_LENGTH = "input[name=length]:invalid";
const validEvent: EventTypeForm = { title: "Reunión 30 min", slug: "reunion-30-min", length: "30" };

const durationLimits = [
  { cp: "CP-14", length: "0", name: "por debajo del mínimo", shouldCreate: false },
  { cp: "CP-15", length: "1", name: "en el mínimo", shouldCreate: true },
];

async function fillEventTypeForm(page: Page, { title, slug, length }: EventTypeForm): Promise<void> {
  await page.locator("[data-testid=new-event-type]:visible").click();
  await page.locator("input[name=title]").fill(title);
  await page.locator("input[name=slug]").fill(slug);
  await page.locator("input[name=length]").fill(length);
}

async function submitEventTypeForm(page: Page): Promise<void> {
  await page.getByRole("dialog").locator("button[type=submit]").click();
}

async function createEventType(page: Page, form: EventTypeForm): Promise<void> {
  await fillEventTypeForm(page, form);
  await submitEventTypeForm(page);
  await page.waitForURL(/\/event-types\/\d+/);
}

test.describe.configure({ mode: "parallel" });

test.describe("US-05 Tipos de evento", () => {
  let userId: number;
  let username: string;

  test.beforeEach(async ({ users }) => {
    const user = await users.create();
    userId = user.id;
    username = user.username ?? "";
    await user.apiLogin("/event-types");
  });

  test.afterEach(async ({ page, users }, testInfo) => {
    await captureEvidence(page, testInfo);
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-13 muestra el evento creado en la lista", async ({ page }) => {
    await createEventType(page, validEvent);
    await page.goto("/event-types");

    await expect(page.getByText(validEvent.title, { exact: true })).toBeVisible();
  });

  test("CP-13 publica la página de reserva del evento creado", async ({ page }) => {
    await createEventType(page, validEvent);
    await page.goto(`/${username}/${validEvent.slug}`);

    await expect(page.locator("[data-testid=event-title]")).toHaveText(validEvent.title);
  });

  // El formulario usa la validación nativa del navegador, que bloquea el envío antes del mensaje propio.
  test("CP-14 marca como inválida una duración de 0", async ({ page }) => {
    await fillEventTypeForm(page, { title: "QA duración cero", slug: "qa-duracion-0", length: "0" });
    await submitEventTypeForm(page);

    await expect(page.locator(INVALID_LENGTH)).toBeVisible();
  });

  for (const { cp, length, name, shouldCreate } of durationLimits) {
    test(`${cp} ${shouldCreate ? "crea" : "no crea"} el evento con duración ${name}`, async ({
      page,
      prisma,
    }) => {
      const slug = `qa-duracion-${length}`;
      await fillEventTypeForm(page, { title: `QA duración ${length}`, slug, length });
      if (shouldCreate) {
        await submitEventTypeForm(page);
        await page.waitForURL(/\/event-types\/\d+/);
      } else {
        await submitEventTypeForm(page);
        await page.locator(INVALID_LENGTH).waitFor();
      }
      const created = await prisma.eventType.count({ where: { userId, slug } });

      expect(created).toBe(shouldCreate ? 1 : 0);
    });
  }

  test("CP-16 exige el título", async ({ page }) => {
    await fillEventTypeForm(page, { title: "", slug: "qa-sin-titulo", length: "30" });
    await submitEventTypeForm(page);

    await expect(page.getByText("String must contain at least 1 character(s)")).toBeVisible();
  });

  test("CP-17 rechaza una URL repetida", async ({ page }) => {
    await createEventType(page, validEvent);
    await page.goto("/event-types");
    await fillEventTypeForm(page, { ...validEvent, title: "QA duplicado" });
    const response = page.waitForResponse(CREATE_API);
    await submitEventTypeForm(page);
    await response;

    await expect(page.getByText(/An event type with this URL already exists/)).toBeVisible({
      timeout: VISIBLE_MESSAGE_TIMEOUT,
    });
  });
});
