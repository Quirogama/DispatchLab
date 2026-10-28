package com.dispatchlab.api.experiment;

import org.springframework.stereotype.Repository;
import org.springframework.context.annotation.Profile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Repository
@Profile("memory")
public class InMemoryExperimentRepository implements ExperimentRepository {
    private final ConcurrentMap<UUID, ExperimentResponse> experiments = new ConcurrentHashMap<>();

    @Override
    public ExperimentResponse save(ExperimentResponse experiment) {
        experiments.put(experiment.id(), experiment);
        return experiment;
    }

    @Override
    public List<ExperimentResponse> findAll() {
        return experiments.values().stream()
            .sorted(Comparator.comparing(ExperimentResponse::createdAt).reversed())
            .map(this::copy)
            .toList();
    }

    @Override
    public Optional<ExperimentResponse> findById(UUID id) {
        return Optional.ofNullable(experiments.get(id)).map(this::copy);
    }

    private ExperimentResponse copy(ExperimentResponse experiment) {
        return new ExperimentResponse(
            experiment.id(),
            experiment.seed(),
            experiment.durationSeconds(),
            experiment.courierCount(),
            experiment.createdAt(),
            List.copyOf(new ArrayList<>(experiment.results()))
        );
    }
}
