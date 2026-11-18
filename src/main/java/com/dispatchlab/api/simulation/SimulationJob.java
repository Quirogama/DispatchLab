package com.dispatchlab.api.simulation;

import java.time.Instant;
import java.util.UUID;

public record SimulationJob(
    UUID id,
    String idempotencyKey,
    long seed,
    int durationSeconds,
    int courierCount,
    String requestJson,
    String status,
    String workerId,
    int attemptCount,
    String errorMessage,
    UUID resultExperimentId,
    Instant createdAt,
    Instant updatedAt
) {
}
