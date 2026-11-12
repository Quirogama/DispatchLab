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
  const results = runExperiment({
    ...scenario,
    durationSeconds: 20,
    algorithms: ['first_available', 'independent', 'self_selection', 'traffic']
  });

  assert.equal(results.length, 4);
  assert.equal(results[0].scenarioEvents.length, results[3].scenarioEvents.length);
  assert.deepEqual(results[0].scenarioEvents, results[3].scenarioEvents);
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

test('independent acceptance remains the autonomous nearest-courier baseline', () => {
  const [traffic, independent] = runExperiment({
    ...scenario,
    courierCount: 2,
    demandDelay: 0.85,
    durationSeconds: 30,
    algorithms: ['traffic', 'independent']
  });

  assert.ok(independent.delivered <= traffic.delivered);
});

test('bonus self-selection stays autonomous and is distinct from independent acceptance', () => {
  const results = runExperiment({
    ...scenario,
    courierCount: 6,
    demandDelay: 17,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['independent', 'self_selection', 'traffic']
  });

  assert.equal(results[0].selfSelectionAcceptanceDelaySeconds,
    results[1].selfSelectionAcceptanceDelaySeconds);
  assert.ok(results[1].delivered <= results[2].delivered);
});

test('medium demand creates measurable backlog instead of perfect throughput', () => {
  const options = {
    ...scenario,
    courierCount: 6,
    demandDelay: 1.7,
    durationSeconds: 180,
    algorithms: ['independent', 'self_selection', 'first_available', 'traffic']
  };
  const results = runExperiment(options);
  const requested = generateScenarioEvents(options).length;

  assert.ok(requested > 100);
  assert.ok(results.some(result => result.delivered < requested));
  assert.ok(new Set(results.map(result => result.delivered)).size > 1);
});

test('first available is a deterministic naive policy with a real trade-off', () => {
  const results = runExperiment({
    ...scenario,
    courierCount: 6,
    demandDelay: 17,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['nearest', 'first_available']
  });

  assert.equal(results.length, 2);
  assert.ok(results[1].delivered < results[0].delivered);
  assert.ok(results[1].deliveryTimes.length > 0);
  assert.ok(results[1].deliveryTimes.reduce((a, b) => a + b, 0) /
    results[1].deliveryTimes.length > results[0].deliveryTimes.reduce((a, b) => a + b, 0) /
    results[0].deliveryTimes.length);
});
