// Smoke runner — aggregates tests registered on globalThis.__papitaTests.
globalThis.__papitaTests = [];

await import("./csv.test.mjs");
await import("./store.test.mjs");
await import("./parser-row-regex.test.mjs");

let pass = 0, fail = 0;
for (const t of globalThis.__papitaTests) {
  try {
    await t.fn();
    console.log("  ok " + t.name);
    pass++;
  } catch (e) {
    console.log("  FAIL " + t.name + " - " + e.message);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
