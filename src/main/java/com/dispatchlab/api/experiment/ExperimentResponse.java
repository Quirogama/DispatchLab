package com.dispatchlab.api.experiment;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ExperimentResponse(
    UUID id,
    long seed,
    int durationSeconds,
    int courierCount,
    Instant createdAt,
    List<ExperimentResultRequest> results
) {
}
