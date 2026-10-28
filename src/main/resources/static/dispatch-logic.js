function calculateCongestion(from, to) {
  const corridorBias = (from.x === 3 || from.x === 8 || to.x === 3 || to.x === 8) ? 0.8 : 0;
  const verticalBias = (from.y === 2 || from.y === 5 || to.y === 2 || to.y === 5) ? 0.5 : 0;
  const centerBias = (from.x >= 4 && from.x <= 7 && from.y >= 2 && from.y <= 5) ? 0.45 : 0;
  return 0.2 + corridorBias + verticalBias + centerBias;
}

export function buildGridGraph({ columns = 12, rows = 8 } = {}) {
  const nodes = [];
  const adjacency = new Map();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const key = `${x},${y}`;
      nodes.push({ x, y, key });
      adjacency.set(key, []);
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const key = `${x},${y}`;
      const current = { x, y };
      const neighbors = adjacency.get(key);

      const candidateNeighbors = [
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x - 1, y },
        { x, y: y - 1 }
      ];

      candidateNeighbors.forEach((neighbor) => {
        if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= columns || neighbor.y >= rows) return;
        const congestion = calculateCongestion(current, neighbor);
        neighbors.push({
          x: neighbor.x,
          y: neighbor.y,
          congestion,
          traffic: 0,
          baseSpeed: 1,
          weight: 1 + congestion * 1.8
        });
      });

      adjacency.set(key, neighbors.filter((neighbor) => !(neighbor.x === current.x && neighbor.y === current.y)));
    }
  }

  return { columns, rows, nodes, adjacency };
}

export function toNodeKey(node) {
  return `${node.x},${node.y}`;
}

export function getEdge(graph, from, to) {
  const fromKey = toNodeKey(from);
  const toKey = toNodeKey(to);
  return (graph.adjacency.get(fromKey) ?? []).find((edge) => toNodeKey(edge) === toKey) ?? null;
}

export function getEffectiveTraffic(edge) {
  if (!edge) return 0.2;
  const traffic = Number(edge.traffic ?? 0);
  const base = Number(edge.congestion ?? 0.2);
  return Math.min(2.2, Math.max(0.2, base + traffic));
}

export function recomputeEdgeWeights(graph) {
  graph.nodes.forEach((node) => {
    const key = toNodeKey(node);
    const neighbors = graph.adjacency.get(key) ?? [];
    neighbors.forEach((edge) => {
      const traffic = getEffectiveTraffic(edge);
      edge.weight = 1 + traffic * 1.8;
    });
  });
}

export function nearestNode(graph, point) {
  let best = { x: 0, y: 0 };
  let bestDistance = Infinity;

  for (const node of graph.nodes) {
    const dx = node.x - point.x;
    const dy = node.y - point.y;
    const distance = (dx * dx) + (dy * dy);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: node.x, y: node.y };
    }
  }

  return best;
}

export function shortestPath(graph, start, end) {
  const startKey = toNodeKey(start);
  const endKey = toNodeKey(end);
  const costs = new Map([[startKey, 0]]);
  const previous = new Map();
  let sequence = 0;
  const queue = [{ key: startKey, cost: 0, sequence: sequence++ }];
  const compare = (left, right) => left.cost - right.cost || left.sequence - right.sequence;

  const push = (item) => {
    queue.push(item);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(queue[parent], queue[index]) <= 0) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };

  const pop = () => {
    const first = queue[0];
    const last = queue.pop();
    if (queue.length > 0 && last) {
      queue[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < queue.length && compare(queue[left], queue[smallest]) < 0) smallest = left;
        if (right < queue.length && compare(queue[right], queue[smallest]) < 0) smallest = right;
        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }
    return first;
  };

  while (queue.length > 0) {
    const current = pop();
    const currentKey = current.key;
    if (current.cost > (costs.get(currentKey) ?? Infinity)) continue;
    if (currentKey === endKey) break;

    for (const neighbor of graph.adjacency.get(currentKey) ?? []) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      const edgeWeight = neighbor.weight ?? 1;
      const candidateCost = (costs.get(currentKey) ?? Infinity) + edgeWeight;

      if (candidateCost < (costs.get(neighborKey) ?? Infinity)) {
        costs.set(neighborKey, candidateCost);
        previous.set(neighborKey, currentKey);
        push({ key: neighborKey, cost: candidateCost, sequence: sequence++ });
      }
    }
  }

  if (!previous.has(endKey) && startKey !== endKey) {
    return [{ ...start }];
  }

  const route = [];
  let cursor = endKey;

  while (cursor) {
    const [x, y] = cursor.split(',').map(Number);
    route.unshift({ x, y });
    cursor = previous.get(cursor) ?? null;
  }

  return route.length > 0 ? route : [{ ...start }];
}

export function nodeDistance(graph, start, end) {
  const route = shortestPath(graph, start, end);
  let total = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index];
    const to = route[index + 1];
    const edge = getEdge(graph, from, to);
    total += edge ? (edge.weight ?? 1) : 1;
  }

  return total;
}

export function orderRequests(requests, policy) {
  return [...requests].sort((a, b) => policy === 'priority'
    ? (b.priority - a.priority) || (a.createdAt - b.createdAt)
    : a.createdAt - b.createdAt);
}
