package com.dispatchlab.api.simulation;

import java.time.Instant;
import java.util.UUID;

public record SimulationJobResponse(
    UUID id,
    String status,
    Integer attemptCount,
    String errorMessage,
    UUID resultExperimentId,
    Instant createdAt,
    Instant updatedAt
) {
}
