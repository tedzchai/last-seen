// src/run-once.ts
import { runDailyBatch } from './batch';
import { runIncremental } from './incremental';

async function main() {
  console.log("Testing environment...");

  // Run the daily batch once (lookahead + LLM + geocode + cache)
  await runDailyBatch();

  // Run the incremental job once (lookback + cache → last-seen.json)
  await runIncremental();

  console.log("All done!");
}

main().catch(e => {
  console.error("Error in run-once:", e);
  process.exit(1);
});
