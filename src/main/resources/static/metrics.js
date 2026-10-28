export function percentile(values, percentileRank) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * percentileRank;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];

    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function calculateMetrics(state, activeEtas = []) {
    const waitingRequests = state.requests.filter(request =>
        request.assigned == null || request.assigned === false
    );
    const completed = state.delivered;
    const totalCourierTime = state.elapsed * state.couriers.length;
    const busyTime = state.couriers.reduce((total, courier) => total + courier.profile.busyTime, 0);
    const totalPickupTime = state.couriers.reduce((total, courier) => total + courier.profile.totalPickupTime, 0);
    const completedRequests = state.completedRequests ?? [];
    const assignedDistance = state.totalAssignedDistance ?? state.totalDistance ?? 0;
    const completedDistance = state.totalCompletedDistance ?? state.totalDistance ?? 0;
    const assigned = state.requests.filter(request =>
        request.assigned != null && request.assigned !== false
    ).length + completedRequests.length;

    return {
        delivered: completed,
        waiting: waitingRequests.length,
        assigned,
        pending: state.requests.length,
        averageDistance: completed > 0 ? completedDistance / completed : 0,
        plannedAverageDistance: assigned > 0 ? assignedDistance / assigned : 0,
        averageWaitTime: waitingRequests.length > 0
            ? waitingRequests.reduce((total, request) => total + request.age, 0) / waitingRequests.length
            : 0,
        averageEta: activeEtas.length > 0
            ? activeEtas.reduce((total, eta) => total + eta, 0) / activeEtas.length
            : 0,
        averagePickupTime: completed > 0 ? totalPickupTime / completed : 0,
        p95DeliveryTime: percentile(state.deliveryTimes, 0.95),
        serviceLevel: completed > 0 ? (state.onTimeDeliveries / completed) * 100 : 0,
        utilization: totalCourierTime > 0 ? Math.min(100, (busyTime / totalCourierTime) * 100) : 0,
        averageRating: completed > 0 ? state.totalRating / completed : 0
    };
}

export function summarizeRun(state, algorithm) {
    const metrics = calculateMetrics(state);
    return {
        algorithm,
        seed: state.seed,
        couriers: state.couriers.length,
        delivered: metrics.delivered,
        waiting: metrics.waiting,
        pending: metrics.pending,
        assigned: metrics.assigned,
        averageDistance: metrics.averageDistance,
        plannedAverageDistance: metrics.plannedAverageDistance,
        averagePickupTime: metrics.averagePickupTime,
        p95DeliveryTime: metrics.p95DeliveryTime,
        serviceLevel: metrics.serviceLevel,
        utilization: metrics.utilization,
        rating: metrics.averageRating
    };
}
