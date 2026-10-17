import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGridGraph, shortestPath, nodeDistance, orderRequests } from '../src/main/resources/static/dispatch-logic.js';

test('buildGridGraph creates street intersections and adjacency', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  assert.equal(graph.nodes.length, 6);
  assert.ok(graph.adjacency.has('0,0'));
  assert.equal(graph.adjacency.get('0,0').length, 2);
});

test('shortestPath finds the route through street edges', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  const route = shortestPath(graph, { x: 0, y: 0 }, { x: 2, y: 1 });
  assert.deepEqual(route.map(node => `${node.x},${node.y}`), ['0,0', '1,0', '2,0', '2,1']);
});

test('nodeDistance measures street-edge distance', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  assert.ok(Math.abs(nodeDistance(graph, { x: 0, y: 0 }, { x: 2, y: 0 }) - 2.72) < 0.001);
  assert.ok(Math.abs(nodeDistance(graph, { x: 0, y: 0 }, { x: 2, y: 1 }) - 4.08) < 0.001);
});

test('request ordering keeps FIFO policies fair and prioritizes urgent work', () => {
  const requests = [
    { id: 'first', createdAt: 1, priority: 1 },
    { id: 'second', createdAt: 2, priority: 3 },
    { id: 'third', createdAt: 3, priority: 2 }
  ];

  assert.deepEqual(orderRequests(requests, 'nearest').map(request => request.id), ['first', 'second', 'third']);
  assert.deepEqual(orderRequests(requests, 'traffic').map(request => request.id), ['first', 'second', 'third']);
  assert.deepEqual(orderRequests(requests, 'priority').map(request => request.id), ['second', 'third', 'first']);
  assert.deepEqual(requests.map(request => request.id), ['first', 'second', 'third']);
});
