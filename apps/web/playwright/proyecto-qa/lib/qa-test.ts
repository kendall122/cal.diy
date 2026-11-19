import { test as base } from "../../lib/fixtures";

// El contexto `request` por defecto falla con el storageState del repositorio; el de la página es equivalente.
export const test = base.extend({
  request: async ({ page }, use) => {
    await use(page.request);
  },
});
