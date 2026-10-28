import {
  buildGridGraph,
  getEdge,
  getEffectiveTraffic,
  nodeDistance,
  recomputeEdgeWeights,
  shortestPath,
  orderRequests
} from './dispatch-logic.js';

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
  const route = shortestPath(graph, from, to);
  return route.length > 1 ? route.reduce((total, node, index) => {
    if (index === 0) return total;
    const edge = getEdge(graph, route[index - 1], node);
    return total + (edge?.weight ?? 1);
  }, 0) : 0;
}

export function travelTime(graph, from, to) {
  const route = shortestPath(graph, from, to);
  return route.reduce((total, node, index) => {
    if (index === 0) return total;
    const edge = getEdge(graph, route[index - 1], node);
    const traffic = getEffectiveTraffic(edge);
    return total + ((edge?.weight ?? 1) * traffic);
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
  const pickupScore = Math.max(0, 1 - pickupTime / 90);
  const deliveryScore = Math.max(0, 1 - deliveryTime / 180);
  const orderRating = 3 + ((pickupScore + deliveryScore) / 2) * 2;
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
    if (state.algorithm === 'traffic') return travelTime(state.graph, courier, request.pickup);
    if (state.algorithm === 'balanced') {
      return (courier.profile.completedOrders * state.balancePenalty) +
        roadDistance(state.graph, courier, request.pickup);
    }
    return roadDistance(state.graph, courier, request.pickup);
  };

  return [...available].sort((a, b) => score(a) - score(b) || a.id - b.id)[0];
}

function assignRequests(state) {
  const available = state.couriers.filter(courier => courier.status === 'idle');
  const queued = orderRequests(
    state.requests.filter(request => request.assigned == null),
    state.algorithm
  );

  queued.forEach(request => {
    const courier = chooseCourier(state, request, available);
    if (!courier) return;

    request.assigned = courier.id;
    request.assignedAt = state.elapsed;
    request.actualDistance = roadDistance(state.graph, courier, request.pickup) +
      roadDistance(state.graph, request.pickup, request.destination);
    state.totalAssignedDistance += request.actualDistance;
    courier.status = 'to-pickup';
    courier.request = request;
    courier.route = [];
    available.splice(available.indexOf(courier), 1);
  });
}

function setCourierRoute(state, courier, target) {
  const route = shortestPath(
    state.graph,
    { x: Math.round(courier.x), y: Math.round(courier.y) },
    target
  );
  courier.route = route.length > 1 ? route.slice(1) : [];
}

function completeCourierPhase(state, courier) {
  if (courier.status === 'to-pickup') {
    courier.request.pickedUpAt = state.elapsed;
    courier.status = 'delivering';
    setCourierRoute(state, courier, courier.request.destination);
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
}

function moveCourier(state, courier, deltaSeconds) {
  if (!courier.request) return;
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
  const speed = 1 / getEffectiveTraffic(edge);
  const step = deltaSeconds * speed;

  if (segmentLength <= step) {
    courier.x = next.x;
    courier.y = next.y;
    courier.route.shift();
    if (courier.route.length === 0) completeCourierPhase(state, courier);
  } else {
    courier.x += (dx / segmentLength) * step;
    courier.y += (dy / segmentLength) * step;
  }
}

function updateTraffic(state) {
  const trafficRamp = Math.min(state.elapsed / 20, 1);
  state.graph.nodes.forEach(node => {
    const neighbors = state.graph.adjacency.get(node.key) ?? [];
    neighbors.forEach(edge => {
      const corridorPulse = (edge.x === 3 || edge.x === 8 || edge.y === 2 || edge.y === 5) ? 0.45 : 0;
      const centerPulse = (node.x >= 4 && node.x <= 7 && node.y >= 2 && node.y <= 5) ? 0.3 : 0;
      const wave = Math.sin((state.elapsed * 1.8) + (node.x * 1.7) + (edge.y * 1.1)) * 0.35;
      const targetTraffic = Math.max(0, Math.min(1.2, 0.1 + wave + corridorPulse + centerPulse)) * trafficRamp;
      edge.traffic += (targetTraffic - edge.traffic) * 0.025;
    });
  });
  recomputeEdgeWeights(state.graph);
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
    graph: buildGridGraph(grid),
    requests: [],
    nextRequestId: 0,
    algorithm: options.algorithm ?? 'nearest',
    demandDelay: options.demandDelay ?? 1.7,
    balancePenalty: options.balancePenalty ?? 10,
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
      request: null,
      route: [],
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
  updateTraffic(state);
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
  const demandDelay = options.demandDelay ?? 1.7;
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
  const algorithms = options.algorithms ?? ['nearest', 'priority', 'balanced', 'traffic'];

  return algorithms.map(algorithm => {
    const state = createSimulationState({
      ...options,
      algorithm,
      scenarioEvents: events,
      demandDelay: options.demandDelay ?? 1.7
    });
    for (let elapsed = 0; elapsed < durationSeconds * 1000; elapsed += stepMilliseconds) {
      advanceSimulation(state, stepMilliseconds);
    }
    return state;
  });
}
