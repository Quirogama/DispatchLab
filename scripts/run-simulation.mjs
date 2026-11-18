import { readFileSync } from 'node:fs';
import { runExperiment } from '../src/main/resources/static/simulation-engine.js';
import { summarizeRun } from '../src/main/resources/static/metrics.js';

const request = JSON.parse(readFileSync(0, 'utf8'));
const results = runExperiment({
  seed: request.seed,
  durationSeconds: request.durationSeconds,
  courierCount: request.courierCount,
  grid: request.grid,
  depots: request.depots,
  demandDelay: request.demandDelay,
  algorithms: request.algorithms,
  stepMilliseconds: request.stepMilliseconds
});

process.stdout.write(JSON.stringify(results.map(state => summarizeRun(state, state.algorithm))));
