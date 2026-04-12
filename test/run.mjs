// Smoke test runner for PAPiTA — loads all test files and executes them.
globalThis.__papitaTests = [];

// Load all test files
await import("./store.test.mjs");
await import("./e2e.test.mjs");

// Execute tests
let passed = 0;
let failed = 0;

for (const { name, fn } of globalThis.__papitaTests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split("\n").slice(1, 3);
      for (const line of lines) console.error(`  ${line}`);
    }
    failed++;
  }
}

console.error(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
