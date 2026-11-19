#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SUITE_DIR = "apps/web/playwright/proyecto-qa/";
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const DEFAULT_REPORT = resolve(REPO_ROOT, "test-results/reports/results.xml");
const ENV_FILE = resolve(REPO_ROOT, ".env.qatlas");
const MAX_MESSAGE_LENGTH = 4000;

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] !== "#") return XML_ENTITIES[entity.toLowerCase()];
    const isHex = entity[1].toLowerCase() === "x";
    return String.fromCodePoint(Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10));
  });
}

function parseAttributes(text) {
  const attributes = {};
  for (const [, name, value] of text.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes[name] = decodeXml(value);
  }
  return attributes;
}

export function parseJunit(xml) {
  const tests = [];
  for (const [, rawAttributes, body = ""] of xml.matchAll(
    /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
  )) {
    const attributes = parseAttributes(rawAttributes);
    const failure = body.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    let outcome = "passed";
    if (failure) outcome = "failed";
    else if (/<skipped\b/.test(body)) outcome = "skipped";

    const failureText = failure
      ? decodeXml((failure[3] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "")).trim() ||
        parseAttributes(failure[2]).message ||
        "La prueba falló sin mensaje"
      : null;

    tests.push({
      name: attributes.name ?? "",
      file: attributes.classname ?? "",
      seconds: Number(attributes.time ?? 0),
      outcome,
      failureText,
    });
  }
  return tests;
}

// Un CP puede dividirse en varias pruebas por la regla de un solo expect. QAtlas conserva el
// último resultado de cada caso, así que hay que enviar uno solo por CP o un fallo quedaría oculto.
export function aggregateByCase(tests) {
  const cases = new Map();
  const ignored = [];

  for (const test of tests) {
    const cp = test.name.match(/(?:^|›\s*)(CP-\d{2})\b/)?.[1];
    const suiteIndex = test.file.indexOf(SUITE_DIR);
    if (!cp || suiteIndex === -1) {
      ignored.push(test.name);
      continue;
    }
    const automationId = `${test.file.slice(suiteIndex + SUITE_DIR.length)}#${cp}`;
    if (!cases.has(automationId)) cases.set(automationId, { automationId, cp, tests: [] });
    cases.get(automationId).tests.push(test);
  }

  const results = [...cases.values()].map(({ automationId, cp, tests: caseTests }) => {
    const failed = caseTests.filter((test) => test.outcome === "failed");
    // Un caso con una parte sin ejecutar no se verificó completo: no puede contar como aprobado.
    const hasSkipped = caseTests.some((test) => test.outcome === "skipped");
    let status = "aprobado";
    if (failed.length > 0) status = "fallido";
    else if (hasSkipped) status = "omitido";

    const result = {
      automation_id: automationId,
      status,
      duration_ms: Math.round(caseTests.reduce((total, test) => total + test.seconds, 0) * 1000),
    };
    if (failed.length > 0) {
      result.error_message = failed
        .map((test) => `${test.name}\n${test.failureText}`)
        .join("\n\n")
        .slice(0, MAX_MESSAGE_LENGTH);
    }
    return { cp, testCount: caseTests.length, result };
  });

  return { results, ignored };
}

function parseArguments(argv) {
  const options = { send: false, complete: false, report: DEFAULT_REPORT, project: "CL" };
  const valueOptions = {
    "--archivo": "report",
    "--nombre": "name",
    "--id-corrida": "externalId",
    "--proyecto": "project",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--enviar") options.send = true;
    else if (argument === "--completar") options.complete = true;
    else if (valueOptions[argument] && argv[index + 1]) options[valueOptions[argument]] = argv[++index];
    else throw new Error(`Opción no válida: ${argument}`);
  }
  if (options.complete && !options.send) throw new Error("--completar requiere --enviar");
  return options;
}

function loadSettings() {
  const fileValues = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(QATLAS_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) fileValues[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const url = process.env.QATLAS_URL ?? fileValues.QATLAS_URL;
  const token = process.env.QATLAS_TOKEN ?? fileValues.QATLAS_TOKEN;
  if (!url || !token) throw new Error("Faltan QATLAS_URL o QATLAS_TOKEN en .env.qatlas");
  return { url: url.replace(/\/+$/, ""), token };
}

function git(...args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

async function api({ url, token }, method, path, body) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`QAtlas respondió ${response.status} en ${method} ${path}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function findUnknownIds(settings, project, results) {
  const data = await api(
    settings,
    "GET",
    `/test-cases/automation-ids?project=${encodeURIComponent(project)}`
  );
  const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
  const known = new Set(items.map((item) => item.automation_id));
  return results
    .filter(({ result }) => !known.has(result.automation_id))
    .map(({ result }) => result.automation_id);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!existsSync(options.report)) throw new Error(`No existe el reporte: ${options.report}`);

  const { results, ignored } = aggregateByCase(parseJunit(readFileSync(options.report, "utf8")));
  if (results.length === 0)
    throw new Error("El reporte no tiene pruebas del proyecto con un CP en el título");

  for (const { cp, testCount, result } of results) {
    console.log(`${cp}  ${result.status.padEnd(8)}  ${testCount} prueba(s)  ${result.automation_id}`);
  }
  if (ignored.length > 0) console.log(`Ignoradas por no pertenecer a la suite: ${ignored.length}`);

  const settings = loadSettings();
  const unknownIds = await findUnknownIds(settings, options.project, results);
  if (unknownIds.length > 0)
    throw new Error(`QAtlas no tiene estos Id de automatización: ${unknownIds.join(", ")}`);
  console.log(`Los ${results.length} casos existen en QAtlas.`);

  if (!options.send) {
    console.log("Simulación: no se envió nada. Usa --enviar para registrar la ejecución.");
    return;
  }

  const commit = git("rev-parse", "HEAD");
  const today = new Date().toISOString().slice(0, 10);
  const response = await api(settings, "POST", "/test-runs/ingest", {
    project: options.project,
    run: {
      name: options.name ?? "Ejecución automatizada · Playwright",
      external_id: options.externalId ?? `playwright-${commit.slice(0, 9)}-${today}`,
      environment: "local",
      browser: "chromium",
      branch: git("branch", "--show-current"),
      commit_sha: commit,
    },
    results: results.map(({ result }) => result),
    create_missing_cases: false,
    create_bug_on_failure: false,
  });

  const { test_run: run, summary } = response;
  console.log(
    `${run.code}: ${summary.passed} aprobados, ${summary.failed} fallidos, ${summary.skipped} omitidos, ${summary.unmatched} sin caso.`
  );
  if (summary.unmatched > 0) throw new Error("Algunos resultados no encontraron su caso en QAtlas");

  if (options.complete) {
    await api(settings, "POST", `/test-runs/${run.id}/complete`);
    console.log(`${run.code} quedó completada.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
