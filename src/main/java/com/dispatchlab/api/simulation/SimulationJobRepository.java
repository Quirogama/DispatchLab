package com.dispatchlab.api.simulation;

import java.util.Optional;
import java.util.UUID;

public interface SimulationJobRepository {
    SimulationJob save(SimulationJob job);
    Optional<SimulationJob> findById(UUID id);
    Optional<SimulationJob> findByIdempotencyKey(String idempotencyKey);
    boolean claim(UUID id, String workerId);
    void complete(UUID id, UUID experimentId);
    void fail(UUID id, String errorMessage);
}
