// §20 test system entry point — runs the whole pyramid in order:
//   unit → parser → integration → security (baseline battery) → security-deep → e2e
// Usage:
//   node .selftest/run-all.mjs              # everything (needs app + bridge up)
//   node .selftest/run-all.mjs --offline    # unit + parser only (no services)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { WS, portOpen } from "./helpers.mjs";

const offline = process.argv.includes("--offline");
const suites = [
  { file: "unit.mjs", name: "UNIT (provider·pricing·security·path·permission·parser)", needsNet: false },
  { file: "parser-tests.mjs", name: "UNIT (SSE parsers)", needsNet: false },
  { file: "integration.mjs", name: "INTEGRATION (chat·provider·search·bridge·file·git·term)", needsNet: true },
  { file: "security-live-tests.mjs", name: "SECURITY baseline battery", needsNet: true },
  { file: "security-deep.mjs", name: "SECURITY-DEEP (SSRF·traversal·symlink·injection·CSRF·XSS·auth·rate)", needsNet: true },
  { file: "e2e.mjs", name: "E2E journeys (login·chat·IDE·git·agent workflow)", needsNet: true },
];

const results = [];
for (const t of suites) {
  if (offline && t.needsNet) { console.log(`\n── ${t.name}: skipped (--offline)`); results.push({ name: t.name, state: "SKIP" }); continue; }
  if (t.needsNet && !(await portOpen(3000))) {
    console.log(`\n── ${t.name}: SKIPPED (app not on :3000 — start via start-app.bat)`);
    results.push({ name: t.name, state: "SKIP(no-app)" });
    continue;
  }
  console.log(`\n━━━━━━━━━━ ${t.name} ━━━━━━━━━━`);
  const r = spawnSync(process.execPath, [path.join(WS, ".selftest", t.file)], { cwd: WS, encoding: "utf8", timeout: 600_000 });
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(out.split("\n").filter((l) => /FAIL|SKIP|===|FATAL/.test(l)).join("\n") || out.slice(-400));
  results.push({ name: t.name, state: r.status === 0 ? "PASS" : r.status === 2 ? "SKIP(svc)" : "FAIL" });
}

console.log("\n================= §20 TEST PYRAMID RESULT =================");
for (const x of results) console.log(` ${x.state === "PASS" ? "✔" : x.state === "FAIL" ? "✘" : "○"}  ${x.name}  [${x.state}]`);
const failed = results.filter((x) => x.state === "FAIL").length;
console.log(failed ? `\n${failed} suite(s) FAILED` : "\nALL SUITES GREEN");
process.exit(failed ? 1 : 0);
