#!/usr/bin/env node
(async () => {
  const start = performance.now();
  const { runCli } = await import('../dist/index.js');
  await runCli({ start });
})();
