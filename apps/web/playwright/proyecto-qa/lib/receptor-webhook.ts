import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type ReceivedWebhook = {
  rawBody: string;
  signature: string | undefined;
  triggerEvent: string;
  payload: { startTime?: string; attendees?: { email: string }[]; [key: string]: unknown };
};

const WEBHOOK_TIMEOUT_MS = 30_000;

// Guarda el cuerpo original porque la firma HMAC se calcula sobre el texto exacto recibido.
export async function startWebhookReceiver() {
  const received: ReceivedWebhook[] = [];
  const waiters: (() => void)[] = [];

  const server = createServer((request, response) => {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(rawBody);
      const signature = request.headers["x-cal-signature-256"];
      received.push({
        rawBody,
        signature: Array.isArray(signature) ? signature[0] : signature,
        triggerEvent: body.triggerEvent,
        payload: body.payload,
      });
      response.end("ok");
      for (const notify of waiters.splice(0)) notify();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`,
    close: () => new Promise((resolve) => server.close(resolve)),
    waitForEvent: async (triggerEvent: string): Promise<ReceivedWebhook> => {
      const deadline = Date.now() + WEBHOOK_TIMEOUT_MS;
      for (;;) {
        const match = received.find((webhook) => webhook.triggerEvent === triggerEvent);
        if (match) return match;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`No llegó el webhook ${triggerEvent}`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remaining);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}
