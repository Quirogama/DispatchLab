import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics, percentile } from '../src/main/resources/static/metrics.js';

function createState(overrides = {}) {
    return {
        elapsed: 100,
        delivered: 4,
        totalDistance: 40,
        deliveryTimes: [10, 20, 30, 40],
        onTimeDeliveries: 3,
        totalRating: 18,
        requests: [{ assigned: false, age: 12 }],
        couriers: [
            { profile: { busyTime: 50, totalPickupTime: 20 } },
            { profile: { busyTime: 25, totalPickupTime: 20 } }
        ],
        ...overrides
    };
}

test('percentile interpolates between ordered observations', () => {
    assert.equal(percentile([10, 20, 30, 40], 0.95), 38.5);
});

test('calculateMetrics returns operational measures from simulation state', () => {
    const metrics = calculateMetrics(createState(), [10, 20]);

    assert.equal(metrics.delivered, 4);
    assert.equal(metrics.waiting, 1);
    assert.equal(metrics.averageDistance, 10);
    assert.equal(metrics.averagePickupTime, 10);
    assert.equal(metrics.p95DeliveryTime, 38.5);
    assert.equal(metrics.serviceLevel, 75);
    assert.equal(metrics.utilization, 37.5);
    assert.equal(metrics.averageRating, 4.5);
    assert.equal(metrics.averageEta, 15);
});
