package com.dispatchlab.api.experiment;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ExperimentService {
    private final ExperimentRepository repository;

    public ExperimentService(ExperimentRepository repository) {
        this.repository = repository;
    }

    public ExperimentResponse create(CreateExperimentRequest request) {
        validateResults(request);
        var experiment = new ExperimentResponse(
            UUID.randomUUID(),
            request.seed(),
            request.durationSeconds(),
            request.courierCount(),
            Instant.now(),
            List.copyOf(request.results())
        );
        return repository.save(experiment);
    }

    public List<ExperimentResponse> findAll() {
        return repository.findAll();
    }

    public ExperimentResponse findById(UUID id) {
        return repository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Experiment not found"));
    }

    private void validateResults(CreateExperimentRequest request) {
        request.results().forEach(result -> {
            if (result.serviceLevel() > 100 || result.utilization() > 100 || result.rating() > 5) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Result percentages must be <= 100 and rating must be <= 5"
                );
            }
        });
    }
}
