import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSimulation,
  createSimulationState,
  DEFAULT_DEMAND_DELAY_SECONDS,
  generateScenarioEvents,
  runExperiment,
  travelTime
} from '../src/main/resources/static/simulation-engine.js';
import { getEffectiveTraffic } from '../src/main/resources/static/dispatch-logic.js';

const scenario = {
  seed: 42,
  courierCount: 3,
  grid: { columns: 5, rows: 4 },
  depots: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }],
  demandDelay: 2
};

test('travelTime is positive and reflects current traffic on the route', () => {
  const state = createSimulationState(scenario);
  const direct = travelTime(state.graph, { x: 0, y: 0 }, { x: 1, y: 0 });
  const longer = travelTime(state.graph, { x: 0, y: 0 }, { x: 4, y: 3 });

  assert.ok(direct > 0);
  assert.ok(longer > direct);
});

test('traffic-aware ETA selects a low-traffic detour over a congested direct route', () => {
  const state = createSimulationState({
    ...scenario,
    grid: { columns: 3, rows: 2 }
  });
  state.graph.adjacency.forEach((edges, key) => {
    edges.forEach(edge => {
      edge.traffic = key === '0,0' && edge.x === 1 && edge.y === 0 ||
        key === '1,0' && edge.x === 2 && edge.y === 0
        ? 1.2
        : 0;
    });
  });
  const getEdge = (from, to) => state.graph.adjacency.get(`${from.x},${from.y}`)
    .find(edge => edge.x === to.x && edge.y === to.y);
  const directRouteTime = [
    getEdge({ x: 0, y: 0 }, { x: 1, y: 0 }),
    getEdge({ x: 1, y: 0 }, { x: 2, y: 0 })
  ].reduce((total, edge) => {
    const traffic = getEffectiveTraffic(edge);
    return total + (0.2 * Math.pow(traffic / 0.2, 1.6)) / 0.1;
  }, 0);

  assert.ok(travelTime(state.graph, { x: 0, y: 0 }, { x: 2, y: 0 }) < directRouteTime);
});

test('traffic is seeded, changes in random bursts, and stays consistent across policies', () => {
  const createTrafficState = (seed, algorithm) =>
    createSimulationState({ ...scenario, seed, algorithm, scenarioEvents: [] });
  const first = createTrafficState(42, 'first_available');
  const replay = createTrafficState(42, 'traffic');
  const differentSeed = createTrafficState(43, 'traffic');

  advanceSimulation(first, 1000);
  advanceSimulation(replay, 1000);
  advanceSimulation(differentSeed, 1000);
  assert.deepEqual(first.trafficTargets, replay.trafficTargets);
  assert.notDeepEqual(first.trafficTargets, differentSeed.trafficTargets);

  const initialTargets = new Map(first.trafficTargets);
  advanceSimulation(first, 24000);
  assert.notDeepEqual(first.trafficTargets, initialTargets);
});

test('heavy traffic makes the route dramatically slower than clear roads', () => {
  const state = createSimulationState({
    ...scenario,
    grid: { columns: 2, rows: 1 }
  });
  const clearTravelTime = travelTime(state.graph, { x: 0, y: 0 }, { x: 1, y: 0 });
  state.graph.adjacency.forEach(edges => {
    edges.forEach(edge => { edge.traffic = 2.6; });
  });

  assert.ok(travelTime(state.graph, { x: 0, y: 0 }, { x: 1, y: 0 }) > clearTravelTime * 50);
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

test('first available dispatches immediately on reproducible routes that ignore traffic', () => {
  const createNaiveState = (traffic) => {
    const state = createSimulationState({
      seed: 42,
      algorithm: 'first_available',
      courierCount: 1,
      grid: { columns: 3, rows: 2 },
      depots: [{ x: 0, y: 0 }],
      scenarioEvents: [{
        at: 0.05,
        pickup: { x: 2, y: 1 },
        destination: { x: 0, y: 1 },
        priority: 2
      }]
    });
    if (traffic) {
      state.graph.adjacency.forEach(neighbors => {
        neighbors.forEach(edge => { edge.traffic = 1.2; });
      });
    }
    return advanceSimulation(state, 100);
  };

  const state = createNaiveState(false);
  const congestedState = createNaiveState(true);
  const courier = state.couriers[0];
  const congestedCourier = congestedState.couriers[0];

  assert.equal(courier.status, 'to-pickup');
  assert.equal(courier.acceptanceRemaining, 0);
  assert.deepEqual(courier.route, congestedCourier.route);
  assert.deepEqual(courier.deliveryRoute, congestedCourier.deliveryRoute);
  assert.deepEqual(courier.route[courier.route.length - 1], { x: 2, y: 1 });
  assert.deepEqual(courier.deliveryRoute[courier.deliveryRoute.length - 1], { x: 0, y: 1 });

  for (let second = 0; second < 600 && state.delivered === 0; second += 1) {
    advanceSimulation(state, 1000);
  }
  assert.equal(state.delivered, 1);
});

test('courier ratings penalize late deliveries more than slower on-time deliveries', () => {
  const runDelivery = (traffic) => {
    const state = createSimulationState({
      seed: 42,
      algorithm: 'first_available',
      courierCount: 1,
      grid: { columns: 2, rows: 1 },
      depots: [{ x: 0, y: 0 }],
      serviceTargetSeconds: 5,
      scenarioEvents: [{
        at: 0.05,
        pickup: { x: 0, y: 0 },
        destination: { x: 1, y: 0 },
        priority: 1
      }]
    });
    for (let step = 0; step < 500 && state.delivered === 0; step += 1) {
      if (traffic) {
        state.graph.adjacency.forEach(neighbors => {
          neighbors.forEach(edge => { edge.traffic = 1.2; });
        });
      }
      advanceSimulation(state, 100);
    }
    assert.equal(state.delivered, 1);
    return state.totalRating;
  };

  const onTimeRating = runDelivery(false);
  const lateRating = runDelivery(true);

  assert.ok(onTimeRating >= 4.75);
  assert.ok(lateRating <= 3.6, `${onTimeRating} on-time vs ${lateRating} late`);
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

test('default medium demand produces 80 orders in a one-hour run', () => {
  const events = generateScenarioEvents({ durationSeconds: 3600 });

  assert.equal(DEFAULT_DEMAND_DELAY_SECONDS, 45);
  assert.equal(events.length, 80);
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

test('default experiment strategies are ordered from naive to complex', () => {
  const results = runExperiment({ ...scenario, durationSeconds: 0 });

  assert.deepEqual(
    results.map(result => result.algorithm),
    ['first_available', 'independent', 'self_selection', 'traffic']
  );
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

test('courier decisions stay autonomous with brief, distinct acceptance delays', () => {
  const results = runExperiment({
    ...scenario,
    courierCount: 6,
    demandDelay: 17,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['independent', 'self_selection', 'traffic']
  });

  assert.equal(results[0].acceptanceDelaySeconds, 20);
  assert.equal(results[1].selfSelectionAcceptanceDelaySeconds, 10);
});

test('traffic-aware dispatch outperforms autonomous policies under shared demand', () => {
  const [independent, selfSelection, traffic] = runExperiment({
    seed: 90210,
    courierCount: 6,
    demandDelay: DEFAULT_DEMAND_DELAY_SECONDS,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['independent', 'self_selection', 'traffic']
  });
  const meanDeliveryTime = state =>
    state.deliveryTimes.reduce((total, time) => total + time, 0) / state.deliveryTimes.length;

  assert.ok(traffic.delivered > selfSelection.delivered);
  assert.ok(meanDeliveryTime(traffic) < meanDeliveryTime(independent));
  assert.ok(meanDeliveryTime(selfSelection) < meanDeliveryTime(independent));
  assert.ok(meanDeliveryTime(traffic) < meanDeliveryTime(selfSelection));
});

test('medium-demand self-selection lands in the intended throughput band', () => {
  const result = runExperiment({
    seed: 90210,
    courierCount: 6,
    grid: { columns: 15, rows: 6 },
    depots: [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 2, y: 4 }, { x: 12, y: 4 }],
    demandDelay: DEFAULT_DEMAND_DELAY_SECONDS,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['self_selection']
  })[0];

  assert.ok(result.delivered >= 50 && result.delivered <= 65);
});

test('self-selection uses a meaningful priority bonus and blended traffic cost', () => {
  const baseline = runExperiment({
    ...scenario,
    courierCount: 6,
    demandDelay: 17,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    selfSelectionTrafficWeight: 0,
    selfSelectionBonus: 0,
    algorithms: ['self_selection']
  })[0];
  const balanced = runExperiment({
    ...scenario,
    courierCount: 6,
    demandDelay: 17,
    durationSeconds: 3600,
    stepMilliseconds: 2000,
    algorithms: ['self_selection']
  })[0];

  assert.notDeepEqual(
    balanced.completedRequests.map(request => request.id),
    baseline.completedRequests.map(request => request.id)
  );
  assert.equal(balanced.selfSelectionTrafficWeight, 2);
  assert.equal(balanced.selfSelectionBonus, 6);
});

test('medium demand creates measurable backlog instead of perfect throughput', () => {
  const options = {
    ...scenario,
    courierCount: 6,
    demandDelay: 1.7,
    durationSeconds: 180,
    algorithms: ['first_available', 'independent', 'self_selection', 'traffic']
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
