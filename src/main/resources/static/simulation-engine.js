import {
  buildGridGraph,
  getEdge,
  getEffectiveTraffic,
  nodeDistance,
  recomputeEdgeWeights,
  shortestPath,
  orderRequests
} from './dispatch-logic.js?v=20261125-4';

const COURIER_SPEED = 0.1;
export const DEFAULT_DEMAND_DELAY_SECONDS = 45;
const TRAFFIC_CHANGE_INTERVAL_SECONDS = 24;
const TRAFFIC_RESPONSE_SECONDS = 8;
const TRAFFIC_SPEED_EXPONENT = 1.6;
const DEFAULT_NAMES = ['Maya', 'Leo', 'Nora', 'Sam', 'Iris', 'Alex', 'Zoe', 'Noah', 'Lina', 'Kai'];
const DEFAULT_COLORS = ['#e5684c', '#f09b52', '#c94f59'];

export function createRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function randomStation(random, grid, exclude) {
  let station;
  do {
    station = {
      x: Math.floor(random() * grid.columns),
      y: Math.floor(random() * grid.rows)
    };
  } while (exclude && station.x === exclude.x && station.y === exclude.y);
  return station;
}

function roadDistance(graph, from, to) {
  const route = roadRoute(graph, from, to);
  return routeDistance(graph, route);
}

function roadRoute(graph, from, to) {
  return shortestPath(graph, from, to, () => 1);
}

function streetDistance(graph, from, to) {
  return Math.max(0, roadRoute(graph, from, to).length - 1);
}

function trafficAwareRoute(graph, from, to) {
  return shortestPath(graph, from, to, edge => trafficSlowdown(edge) / COURIER_SPEED);
}

function trafficSlowdown(edge) {
  const traffic = getEffectiveTraffic(edge);
  return 0.2 * Math.pow(traffic / 0.2, TRAFFIC_SPEED_EXPONENT);
}

function courierRoute(state, from, to) {
  if (state.algorithm === 'first_available') {
    return randomizedRoute(state.graph, from, to, state.random);
  }
  if (state.algorithm === 'traffic') {
    return trafficAwareRoute(state.graph, from, to);
  }
  return roadRoute(state.graph, from, to);
}

function routeDistance(graph, route) {
  return route.slice(1).reduce((total, node, index) => {
    const edge = getEdge(graph, route[index], node);
    return total + (edge?.weight ?? 1);
  }, 0);
}

function randomizedRoute(graph, start, end, random) {
  const startKey = `${start.x},${start.y}`;
  const endKey = `${end.x},${end.y}`;
  if (startKey === endKey) return [{ ...start }];

  const visited = new Set([startKey]);
  const previous = new Map();
  const stack = [startKey];

  while (stack.length > 0 && !visited.has(endKey)) {
    const currentKey = stack[stack.length - 1];
    const candidates = (graph.adjacency.get(currentKey) ?? [])
      .filter(node => !visited.has(`${node.x},${node.y}`));
    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[Math.floor(random() * candidates.length)];
    const nextKey = `${next.x},${next.y}`;
    visited.add(nextKey);
    previous.set(nextKey, currentKey);
    stack.push(nextKey);
  }

  if (!visited.has(endKey)) throw new Error(`No route from ${startKey} to ${endKey}`);

  const route = [];
  let currentKey = endKey;
  while (currentKey !== startKey) {
    const [x, y] = currentKey.split(',').map(Number);
    route.unshift({ x, y });
    currentKey = previous.get(currentKey);
  }
  route.unshift({ ...start });
  return route;
}

function trafficWeightedDistance(graph, from, to) {
  const route = trafficAwareRoute(graph, from, to);
  return route.slice(1).reduce((total, node, index) => {
    const edge = getEdge(graph, route[index], node);
    return total + trafficSlowdown(edge) / 0.2;
  }, 0);
}

function selfSelectionCost(state, courier, request) {
  const distance = streetDistance(state.graph, courier, request.pickup);
  const trafficDistance = trafficWeightedDistance(state.graph, courier, request.pickup);
  return distance + state.selfSelectionTrafficWeight * (trafficDistance - distance);
}

export function travelTime(graph, from, to) {
  const route = trafficAwareRoute(graph, from, to);
  return route.reduce((total, node, index) => {
    if (index === 0) return total;
    const edge = getEdge(graph, route[index - 1], node);
    return total + trafficSlowdown(edge) / COURIER_SPEED;
  }, 0);
}

function createRequest(random, state, pickup, destination, colors, priority) {
  return {
    id: `${state.seed}-${state.nextRequestId++}`,
    pickup: { ...pickup },
    destination: { ...destination },
    priority: priority ?? (1 + Math.floor(random() * 3)),
    age: 0,
    createdAt: state.elapsed,
    color: colors[Math.floor(random() * colors.length)]
  };
}

function updateCourierRating(state, courier, request) {
  const pickupTime = request.pickedUpAt - request.assignedAt;
  const deliveryTime = request.deliveredAt - request.pickedUpAt;
  const totalTime = request.deliveredAt - request.assignedAt;
  const serviceTarget = Math.max(1, state.serviceTargetSeconds);
  const efficiencyPenalty = Math.min(totalTime / serviceTarget, 1) * 0.25;
  const delayPenalty = 2 * Math.max(0, totalTime - serviceTarget) / serviceTarget;
  const orderRating = Math.max(1, Math.min(5, 5 - efficiencyPenalty - delayPenalty));
  const completed = courier.profile.completedOrders;

  courier.profile.rating = ((courier.profile.rating * completed) + orderRating) / (completed + 1);
  courier.profile.completedOrders += 1;
  courier.profile.totalPickupTime += pickupTime;
  courier.profile.totalDeliveryTime += deliveryTime;
  courier.profile.completedDistance += request.actualDistance;
  state.totalCompletedDistance += request.actualDistance;
  state.totalRating += orderRating;
  state.deliveryTimes.push(totalTime);
  if (totalTime <= state.serviceTargetSeconds) state.onTimeDeliveries += 1;
}

function chooseCourier(state, request, available) {
  const score = (courier) => {
    if (state.algorithm === 'first_available') return courier.id;
    if (
      (state.algorithm === 'self_selection' || state.algorithm === 'traffic') &&
      courier.id === request.selectedCourierId
    ) return -1;
    if (state.algorithm === 'traffic') return travelTime(state.graph, courier, request.pickup);
    return streetDistance(state.graph, courier, request.pickup);
  };

  return [...available].sort((a, b) => score(a) - score(b) || a.id - b.id)[0];
}

function assignRequests(state) {
  const available = state.couriers.filter(courier => courier.status === 'idle');
  let queued = orderRequests(
    state.requests.filter(request => request.assigned == null),
    state.algorithm
  );
  if (state.algorithm === 'self_selection' || state.algorithm === 'traffic') {
    const matches = [];
    const candidates = [...available];
    while (candidates.length > 0 && queued.length > 0) {
      let bestChoice;
      candidates.forEach(courier => queued.forEach(request => {
        const utility = state.algorithm === 'traffic'
          ? -travelTime(state.graph, courier, request.pickup)
          : (request.priority * state.selfSelectionBonus) -
            selfSelectionCost(state, courier, request);
        if (!bestChoice || utility > bestChoice.utility ||
          (utility === bestChoice.utility && request.createdAt < bestChoice.request.createdAt)) {
          bestChoice = { courier, request, utility };
        }
      }));
      matches.push(bestChoice);
      bestChoice.request.selectedCourierId = bestChoice.courier.id;
      candidates.splice(candidates.indexOf(bestChoice.courier), 1);
      queued = queued.filter(request => request !== bestChoice.request);
    }
    queued = matches.map(match => match.request);
  }

  queued.forEach(request => {
    const courier = chooseCourier(state, request, available);
    if (!courier) return;

    request.assigned = courier.id;
    request.assignedAt = state.elapsed;
    const plannedRoute = state.algorithm === 'first_available' || state.algorithm === 'traffic';
    const pickupRoute = plannedRoute
      ? courierRoute(state, courier, request.pickup)
      : null;
    const deliveryRoute = plannedRoute
      ? courierRoute(state, request.pickup, request.destination)
      : null;
    request.actualDistance = plannedRoute
      ? routeDistance(state.graph, pickupRoute) + routeDistance(state.graph, deliveryRoute)
      : roadDistance(state.graph, courier, request.pickup) +
        roadDistance(state.graph, request.pickup, request.destination);
    state.totalAssignedDistance += request.actualDistance;
    const delayedAcceptance = state.algorithm === 'independent' || state.algorithm === 'self_selection';
    courier.status = delayedAcceptance ? 'accepting' : 'to-pickup';
    courier.acceptanceRemaining = delayedAcceptance
      ? state.algorithm === 'self_selection'
        ? state.selfSelectionAcceptanceDelaySeconds
        : state.acceptanceDelaySeconds
      : 0;
    courier.request = request;
    courier.route = pickupRoute ? pickupRoute.slice(1) : [];
    courier.deliveryRoute = deliveryRoute ? deliveryRoute.slice(1) : null;
    available.splice(available.indexOf(courier), 1);
  });
}

function setCourierRoute(state, courier, target) {
  const start = { x: Math.round(courier.x), y: Math.round(courier.y) };
  const route = courierRoute(state, start, target);
  courier.route = route.length > 1 ? route.slice(1) : [];
}

function completeCourierPhase(state, courier) {
  if (courier.status === 'to-pickup') {
    courier.request.pickedUpAt = state.elapsed;
    courier.status = 'delivering';
    if (state.algorithm === 'traffic') {
      setCourierRoute(state, courier, courier.request.destination);
      courier.deliveryRoute = null;
    } else if (courier.deliveryRoute !== null) {
      courier.route = courier.deliveryRoute;
      courier.deliveryRoute = null;
    } else {
      setCourierRoute(state, courier, courier.request.destination);
    }
    return;
  }

  courier.request.deliveredAt = state.elapsed;
  updateCourierRating(state, courier, courier.request);
  state.delivered += 1;
  state.completedRequests.push(courier.request);
  state.requests = state.requests.filter(request => request !== courier.request);
  courier.request = null;
  courier.status = 'idle';
  courier.route = [];
  courier.deliveryRoute = null;
  courier.routeNeedsReplan = false;
}

function moveCourier(state, courier, deltaSeconds) {
  if (!courier.request) return;
  if (courier.status === 'accepting') {
    courier.acceptanceRemaining -= deltaSeconds;
    if (courier.acceptanceRemaining <= 0) {
      courier.status = 'to-pickup';
      setCourierRoute(state, courier, courier.request.pickup);
    }
    return;
  }

  const target = courier.status === 'to-pickup'
    ? courier.request.pickup
    : courier.request.destination;

  if (courier.route.length === 0) setCourierRoute(state, courier, target);
  if (courier.route.length === 0) {
    courier.x = target.x;
    courier.y = target.y;
    completeCourierPhase(state, courier);
    return;
  }

  const next = courier.route[0];
  const dx = next.x - courier.x;
  const dy = next.y - courier.y;
  const segmentLength = Math.hypot(dx, dy);
  const edge = getEdge(
    state.graph,
    { x: Math.round(courier.x), y: Math.round(courier.y) },
    next
  );
  const speed = COURIER_SPEED / trafficSlowdown(edge);
  const step = deltaSeconds * speed;

  if (segmentLength <= step) {
    courier.x = next.x;
    courier.y = next.y;
    courier.route.shift();
    if (courier.route.length === 0) {
      completeCourierPhase(state, courier);
    } else if (courier.routeNeedsReplan) {
      courier.routeNeedsReplan = false;
      setCourierRoute(state, courier, target);
    }
  } else {
    courier.x += (dx / segmentLength) * step;
    courier.y += (dy / segmentLength) * step;
  }
}

function updateTraffic(state, deltaSeconds) {
  const segment = Math.floor(state.elapsed / TRAFFIC_CHANGE_INTERVAL_SECONDS);
  const changed = segment !== state.trafficSegment;
  if (changed) {
    const targets = new Map();
    state.graph.nodes.forEach(node => {
      (state.graph.adjacency.get(node.key) ?? []).forEach(edge => {
        const from = node.key;
        const to = `${edge.x},${edge.y}`;
        const key = [from, to].sort().join('|');
        if (targets.has(key)) return;
        const corridorBoost = edge.congestion >= 0.8 ? 0.45 : 0;
        targets.set(key, Math.min(2.6, state.trafficRandom() * 2.2 + corridorBoost));
      });
    });
    state.trafficTargets = targets;
    state.trafficSegment = segment;
  }

  const response = 1 - Math.exp(-deltaSeconds / TRAFFIC_RESPONSE_SECONDS);
  state.graph.nodes.forEach(node => {
    const neighbors = state.graph.adjacency.get(node.key) ?? [];
    neighbors.forEach(edge => {
      const from = node.key;
      const to = `${edge.x},${edge.y}`;
      const key = [from, to].sort().join('|');
      const targetTraffic = state.trafficTargets.get(key) ?? 0;
      edge.traffic += (targetTraffic - edge.traffic) * response;
    });
  });
  recomputeEdgeWeights(state.graph);
  return changed;
}

export function createSimulationState(options = {}) {
  const grid = options.grid ?? { columns: 15, rows: 6 };
  const depots = options.depots ?? [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 2, y: 4 }, { x: 12, y: 4 }];
  const courierCount = Math.max(0, Number(options.courierCount ?? 6));
  const seed = Number(options.seed ?? 90210) || 90210;

  return {
    running: false,
    elapsed: 0,
    delivered: 0,
    totalAssignedDistance: 0,
    totalCompletedDistance: 0,
    totalRating: 0,
    onTimeDeliveries: 0,
    deliveryTimes: [],
    completedRequests: [],
    seed,
    random: createRandom(seed),
    trafficRandom: createRandom(seed ^ 0x9e3779b9),
    trafficSegment: -1,
    trafficTargets: new Map(),
    graph: buildGridGraph(grid),
    requests: [],
    nextRequestId: 0,
    algorithm: options.algorithm ?? 'nearest',
    demandDelay: options.demandDelay ?? DEFAULT_DEMAND_DELAY_SECONDS,
    acceptanceDelaySeconds: options.acceptanceDelaySeconds ?? 20,
    selfSelectionBonus: options.selfSelectionBonus ?? 6,
    selfSelectionTrafficWeight: options.selfSelectionTrafficWeight ?? 2,
    selfSelectionAcceptanceDelaySeconds: options.selfSelectionAcceptanceDelaySeconds ?? 10,
    serviceTargetSeconds: options.serviceTargetSeconds ?? 180,
    scenarioEvents: options.scenarioEvents ?? null,
    eventIndex: 0,
    depots,
    grid,
    requestColors: options.requestColors ?? DEFAULT_COLORS,
    couriers: Array.from({ length: courierCount }, (_, index) => ({
      id: index,
      x: depots[index % depots.length]?.x ?? 0,
      y: depots[index % depots.length]?.y ?? 0,
      home: { ...(depots[index % depots.length] ?? { x: 0, y: 0 }) },
      status: 'idle',
      acceptanceRemaining: 0,
      request: null,
      route: [],
      deliveryRoute: null,
      routeNeedsReplan: false,
      profile: {
        name: options.courierNames?.[index % options.courierNames.length] ??
          DEFAULT_NAMES[index % DEFAULT_NAMES.length],
        completedOrders: 0,
        totalPickupTime: 0,
        totalDeliveryTime: 0,
        completedDistance: 0,
        busyTime: 0,
        rating: 5.0
      }
    }))
  };
}

export function addSimulationRequest(state, pickup, destination) {
  const target = destination ?? randomStation(state.random, state.grid, pickup);
  const request = createRequest(state.random, state, pickup, target, state.requestColors);
  state.requests.push(request);
  assignRequests(state);
  return request;
}

function spawnScheduledRequests(state, previousElapsed) {
  if (state.scenarioEvents) {
    while (
      state.eventIndex < state.scenarioEvents.length &&
      state.scenarioEvents[state.eventIndex].at <= state.elapsed
    ) {
      const event = state.scenarioEvents[state.eventIndex++];
      state.requests.push(createRequest(
        state.random,
        state,
        event.pickup,
        event.destination,
        state.requestColors,
        event.priority
      ));
    }
    return;
  }

  const previousBucket = Math.floor(previousElapsed / state.demandDelay);
  const currentBucket = Math.floor(state.elapsed / state.demandDelay);
  for (let bucket = previousBucket + 1; bucket <= currentBucket; bucket += 1) {
    if (state.requests.length <= 10) addSimulationRequest(
      state,
      randomStation(state.random, state.grid)
    );
  }
}

export function advanceSimulation(state, deltaMilliseconds) {
  const deltaSeconds = Math.max(0, Number(deltaMilliseconds) / 1000);
  const previousElapsed = state.elapsed;
  state.elapsed += deltaSeconds;
  const trafficChanged = updateTraffic(state, deltaSeconds);
  if (trafficChanged && state.algorithm === 'traffic') {
    state.couriers.forEach(courier => {
      if (courier.request) courier.routeNeedsReplan = true;
    });
  }
  spawnScheduledRequests(state, previousElapsed);
  state.requests.forEach(request => { request.age += deltaSeconds; });

  state.couriers.forEach(courier => {
    if (courier.status === 'idle') return;
    courier.profile.busyTime += deltaSeconds;
    moveCourier(state, courier, deltaSeconds);
  });
  assignRequests(state);
  return state;
}

export function generateScenarioEvents(options = {}) {
  const random = createRandom(options.seed ?? 90210);
  const grid = options.grid ?? { columns: 15, rows: 6 };
  const durationSeconds = options.durationSeconds ?? 180;
  const demandDelay = options.demandDelay ?? DEFAULT_DEMAND_DELAY_SECONDS;
  const events = [];

  for (let at = demandDelay; at <= durationSeconds; at += demandDelay) {
    const pickup = randomStation(random, grid);
    events.push({
      at: Number(at.toFixed(6)),
      pickup,
      destination: randomStation(random, grid, pickup),
      priority: 1 + Math.floor(random() * 3)
    });
  }
  return events;
}

export function runExperiment(options = {}) {
  const durationSeconds = options.durationSeconds ?? 180;
  const stepMilliseconds = options.stepMilliseconds ?? 100;
  const events = options.scenarioEvents ?? generateScenarioEvents(options);
  const algorithms = options.algorithms ?? ['first_available', 'independent', 'self_selection', 'traffic'];

  return algorithms.map(algorithm => {
    const state = createSimulationState({
      ...options,
      algorithm,
      scenarioEvents: events,
      demandDelay: options.demandDelay ?? DEFAULT_DEMAND_DELAY_SECONDS
    });
    for (let elapsed = 0; elapsed < durationSeconds * 1000; elapsed += stepMilliseconds) {
      advanceSimulation(state, stepMilliseconds);
    }
    return state;
  });
}
