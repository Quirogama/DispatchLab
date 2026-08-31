import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGridGraph, shortestPath, nodeDistance } from './src/main/resources/static/dispatch-logic.js';

test('buildGridGraph creates street intersections and adjacency', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  assert.equal(graph.nodes.length, 12);
  assert.ok(graph.adjacency.has('0,0'));
  assert.equal(graph.adjacency.get('0,0').length, 2);
});

test('shortestPath finds the route through street edges', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  const route = shortestPath(graph, { x: 0, y: 0 }, { x: 2, y: 0 });
  assert.deepEqual(route.map(node => `${node.x},${node.y}`), ['0,0', '1,0', '2,0']);
});

test('nodeDistance measures street-edge distance', () => {
  const graph = buildGridGraph({ columns: 3, rows: 2 });
  assert.equal(nodeDistance(graph, { x: 0, y: 0 }, { x: 2, y: 0 }), 2);
  assert.equal(nodeDistance(graph, { x: 0, y: 0 }, { x: 2, y: 2 }), 4);
});
