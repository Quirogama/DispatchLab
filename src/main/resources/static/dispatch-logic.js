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

      if (x + 1 < columns) neighbors.push({ x: x + 1, y });
      if (y + 1 < rows) neighbors.push({ x, y: y + 1 });
      if (x - 1 >= 0) neighbors.push({ x: x - 1, y });
      if (y - 1 >= 0) neighbors.push({ x, y: y - 1 });

      adjacency.set(key, neighbors.filter((neighbor) => JSON.stringify(neighbor) !== JSON.stringify(current)));
    }
  }

  return { columns, rows, nodes, adjacency };
}

export function toNodeKey(node) {
  return `${node.x},${node.y}`;
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
  const queue = [startKey];
  const visited = new Set([startKey]);
  const previous = new Map();

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (currentKey === endKey) {
      const route = [];
      let cursor = currentKey;
      while (cursor) {
        const [x, y] = cursor.split(',').map(Number);
        route.unshift({ x, y });
        cursor = previous.get(cursor) ?? null;
      }
      return route;
    }

    for (const neighbor of graph.adjacency.get(currentKey) ?? []) {
      const neighborKey = toNodeKey(neighbor);
      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);
      previous.set(neighborKey, currentKey);
      queue.push(neighborKey);
    }
  }

  return [{ ...start }];
}

export function nodeDistance(graph, start, end) {
  const path = shortestPath(graph, start, end);
  return Math.max(0, path.length - 1);
}
