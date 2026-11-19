import { expect } from "@playwright/test";
import { test } from "../../lib/fixtures";
import { retryOnBusyDatabase } from "../lib/reservas";

const GOOGLE_APP_SLUG = "google-calendar";
const FAKE_CLIENT_ID = "cliente-qa.apps.googleusercontent.com";

// Todas las pruebas de este archivo cambian el mismo registro compartido de la app.
test.describe.configure({ mode: "serial" });

test.describe("US-04 Conexión con Google Calendar", () => {
  let authorizationUrl: URL;
  let originalKeys: unknown;

  test.beforeAll(async ({ prisma }) => {
    const app = await prisma.app.findUniqueOrThrow({
      where: { slug: GOOGLE_APP_SLUG },
      select: { keys: true },
    });
    originalKeys = app.keys;
    await prisma.app.update({
      where: { slug: GOOGLE_APP_SLUG },
      data: {
        keys: {
          client_id: FAKE_CLIENT_ID,
          client_secret: "secreto-falso-qa",
          redirect_uris: ["http://localhost:3000/api/integrations/googlecalendar/callback"],
        },
      },
      select: { slug: true },
    });
  });

  test.afterAll(async ({ prisma }) => {
    await prisma.$executeRaw`UPDATE "App" SET "keys" = ${originalKeys === null ? null : JSON.stringify(originalKeys)}::jsonb WHERE "slug" = ${GOOGLE_APP_SLUG}`;
  });

  test.beforeEach(async ({ page, users }) => {
    const user = await retryOnBusyDatabase(() => users.create());
    await user.apiLogin("/apps/installed/calendar");
    const response = await page.request.get("/api/integrations/googlecalendar/add");
    const { url } = await response.json();
    authorizationUrl = new URL(url);
  });

  test.afterEach(async ({ users }) => {
    await retryOnBusyDatabase(() => users.deleteAll());
  });

  test("CP-49 envía el client_id configurado a Google", async () => {
    expect(authorizationUrl.searchParams.get("client_id")).toBe(FAKE_CLIENT_ID);
  });

  test("CP-49 solicita el permiso de Google Calendar", async () => {
    expect(authorizationUrl.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar");
  });
});
