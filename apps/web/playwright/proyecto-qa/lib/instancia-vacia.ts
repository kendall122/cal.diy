import type { ChildProcess } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const CONTAINER = "cal-qa-registro";
const DATABASE_PORT = 5452;
export const EMPTY_INSTANCE_PORT = 3100;
export const EMPTY_INSTANCE_URL = `http://localhost:${EMPTY_INSTANCE_PORT}`;

const REPO_ROOT = resolve(__dirname, "../../../../..");
const DATABASE_URL = `postgresql://postgres:@localhost:${DATABASE_PORT}/calendso`;
const instanceEnv = Object.fromEntries(
  Object.entries({
    ...process.env,
    DATABASE_URL,
    DATABASE_DIRECT_URL: DATABASE_URL,
    NEXTAUTH_URL: EMPTY_INSTANCE_URL,
    NEXT_PUBLIC_IS_E2E: "1",
  })
) as NodeJS.ProcessEnv;

let server: ChildProcess | undefined;

function runDocker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function waitUntil(check: () => boolean | Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Tiempo agotado esperando: ${description}`);
}

export function queryEmptyInstance(sql: string): string {
  return runDocker("exec", CONTAINER, "psql", "-U", "postgres", "-d", "calendso", "-Atc", sql);
}

export function stopEmptyInstance(): void {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // El servidor ya terminó.
    }
  }
  server = undefined;
  try {
    runDocker("rm", "-f", CONTAINER);
  } catch {
    // El contenedor no llegó a crearse.
  }
}

// La suite usa la base normal; esta instancia aparte permite probar el primer registro sin tocarla.
export async function startEmptyInstance(): Promise<void> {
  stopEmptyInstance();
  runDocker(
    "run",
    "-d",
    "--rm",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=calendso",
    "-p",
    `${DATABASE_PORT}:5432`,
    "postgres:18"
  );
  await waitUntil(() => {
    try {
      runDocker("exec", CONTAINER, "pg_isready", "-U", "postgres", "-h", "127.0.0.1", "-q");
      return true;
    } catch {
      return false;
    }
  }, "la base temporal");
  execFileSync("yarn", ["workspace", "@calcom/prisma", "prisma", "migrate", "deploy"], {
    cwd: REPO_ROOT,
    env: instanceEnv,
    stdio: "ignore",
  });
  server = spawn("yarn", ["next", "start", "-p", String(EMPTY_INSTANCE_PORT)], {
    cwd: resolve(REPO_ROOT, "apps/web"),
    env: instanceEnv,
    stdio: "ignore",
    detached: true,
  });
  await waitUntil(async () => {
    try {
      return (await fetch(`${EMPTY_INSTANCE_URL}/auth/setup?step=1`)).ok;
    } catch {
      return false;
    }
  }, "la aplicación temporal");
}
