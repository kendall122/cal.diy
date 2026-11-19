#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { aggregateByCase, api, loadSettings, parseJunit } from "./publicar-qatlas.mjs";

const KNOWN_DEFECTS = { "CP-29": "CL-BUG-3", "CP-54": "CL-BUG-5" };
const MAX_ATTACHMENTS_PER_CASE = 10;
const MAX_NOTE_LENGTH = 600;

function parseArguments(argv) {
  const options = { send: false };
  const valueOptions = { "--ejecucion": "run", "--archivo": "report", "--capturas": "captures" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--enviar") options.send = true;
    else if (valueOptions[argv[index]] && argv[index + 1]) options[valueOptions[argv[index]]] = argv[++index];
    else throw new Error(`Opción no válida: ${argv[index]}`);
  }
  if (!options.run || !options.report || !options.captures) {
    throw new Error("Usa --ejecucion <código> --archivo <results.xml> --capturas <carpeta> [--enviar]");
  }
  return options;
}

function testName(test) {
  return test.name.split("›").pop().trim();
}

export function buildNote(cp, automationId, tests) {
  const passed = tests.filter((test) => test.outcome === "passed");
  const failed = tests.filter((test) => test.outcome === "failed");
  const defect = failed.length > 0 && KNOWN_DEFECTS[cp] ? ` Defecto relacionado: ${KNOWN_DEFECTS[cp]}.` : "";
  const failedText = failed.length > 0 ? ` Falló: ${failed.map(testName).join("; ")}.` : "";
  const checks = tests.map((test) => testName(test).replace(/^CP-\d{2}\s*/, "")).join("; ");
  const note = `Prueba automatizada en ${automationId.split("#")[0]}. ${passed.length} de ${tests.length} aprobadas. Verifica: ${checks}.${failedText}${defect}`;
  return note.slice(0, MAX_NOTE_LENGTH);
}

async function uploadScreenshot({ url, token }, caseId, stepOrder, directory, fileName) {
  const form = new FormData();
  form.set("entity_type", "test_run_case");
  form.set("entity_id", String(caseId));
  form.set("step_order", String(stepOrder));
  form.set("file", new Blob([readFileSync(join(directory, fileName))], { type: "image/png" }), fileName);
  const response = await fetch(`${url}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok)
    throw new Error(`No se pudo subir ${fileName}: ${response.status} ${await response.text()}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const captures = resolve(options.captures);
  if (!existsSync(captures)) throw new Error(`No existe la carpeta: ${captures}`);
  const settings = loadSettings();
  const run = await api(settings, "GET", `/test-runs/by-code/${encodeURIComponent(options.run)}`);
  const tests = parseJunit(readFileSync(options.report, "utf8"));
  const { results } = aggregateByCase(tests);
  const files = readdirSync(captures).filter((file) => file.endsWith(".png"));
  const missing = [];
  let uploaded = 0;

  for (const runCase of run.cases) {
    const cp = runCase.test_case_title.match(/CP-\d{2}/)?.[0];
    const result = results.find((item) => item.cp === cp);
    const screenshots = files.filter((file) => file.startsWith(`${cp}_`)).slice(0, MAX_ATTACHMENTS_PER_CASE);
    if (!result || screenshots.length === 0) {
      missing.push(cp);
      continue;
    }
    const caseTests = tests.filter((test) => test.name.match(/(?:^|›\s*)(CP-\d{2})\b/)?.[1] === cp);
    const notes = buildNote(cp, result.result.automation_id, caseTests);
    const stepOrder = Math.max(...runCase.step_results.map((step) => step.order));
    console.log(`${cp}  ${runCase.status}  ${screenshots.length} captura(s) en el paso ${stepOrder}`);
    if (!options.send) continue;

    await api(settings, "PATCH", `/test-runs/${run.id}/cases/${runCase.id}`, {
      status: runCase.status,
      notes,
    });
    const attached = await api(
      settings,
      "GET",
      `/attachments?entity_type=test_run_case&entity_id=${runCase.id}&step_order=${stepOrder}`
    );
    const existing = new Set(
      (Array.isArray(attached) ? attached : (attached.items ?? [])).map((item) => item.filename)
    );
    for (const fileName of screenshots.filter((file) => !existing.has(file))) {
      await uploadScreenshot(settings, runCase.id, stepOrder, captures, fileName);
      uploaded += 1;
    }
  }

  if (missing.length > 0) throw new Error(`Faltan resultados o capturas de: ${missing.join(", ")}`);
  console.log(
    options.send ? `Notas actualizadas y ${uploaded} capturas subidas.` : "Simulación: no se envió nada."
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
