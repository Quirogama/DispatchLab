package com.dispatchlab.api.experiment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExperimentRepository {
    ExperimentResponse save(ExperimentResponse experiment);

    List<ExperimentResponse> findAll();

    Optional<ExperimentResponse> findById(UUID id);
}
