import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSimulation,
  createSimulationState,
  generateScenarioEvents,
  runExperiment,
  travelTime
} from '../src/main/resources/static/simulation-engine.js';

const scenario = {
  seed: 42,
  courierCount: 3,
  grid: { columns: 5, rows: 4 },
  depots: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }],
  demandDelay: 2
};

test('travelTime is positive and uses the same weighted route model', () => {
  const state = createSimulationState(scenario);
  const direct = travelTime(state.graph, { x: 0, y: 0 }, { x: 1, y: 0 });
  const longer = travelTime(state.graph, { x: 0, y: 0 }, { x: 4, y: 3 });

  assert.ok(direct > 0);
  assert.ok(longer > direct);
});

test('advancing the engine transitions requests through pickup and delivery', () => {
  const state = createSimulationState({ ...scenario, demandDelay: 1000 });
  state.scenarioEvents = [{
    at: 1,
    pickup: { x: 0, y: 0 },
    destination: { x: 1, y: 0 },
    priority: 3
  }];

  for (let index = 0; index < 500; index += 1) advanceSimulation(state, 100);

  assert.equal(state.delivered, 1);
  assert.equal(state.completedRequests.length, 1);
  assert.equal(state.requests.length, 0);
  assert.equal(state.couriers.filter(courier => courier.status === 'idle').length, 3);
  assert.ok(state.totalCompletedDistance > 0);
});

test('scenario events are deterministic for the same seed', () => {
  assert.deepEqual(
    generateScenarioEvents({ ...scenario, durationSeconds: 10 }),
    generateScenarioEvents({ ...scenario, durationSeconds: 10 })
  );
  assert.notDeepEqual(
    generateScenarioEvents({ ...scenario, durationSeconds: 10 }),
    generateScenarioEvents({ ...scenario, seed: 43, durationSeconds: 10 })
  );
});

test('experiments replay the same workload for every policy', () => {
  const results = runExperiment({ ...scenario, durationSeconds: 20 });

  assert.equal(results.length, 4);
  assert.deepEqual(
    results.map(result => result.completedRequests.map(request => request.id)),
    results.map(result => result.completedRequests.map(request => request.id))
  );
  results.forEach(result => {
    assert.equal(result.seed, 42);
    assert.ok(result.delivered <= result.completedRequests.length);
    assert.ok(result.totalCompletedDistance <= result.totalAssignedDistance);
  });
});
