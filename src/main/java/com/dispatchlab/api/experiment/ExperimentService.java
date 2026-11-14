package com.dispatchlab.api.experiment;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class ExperimentService {
    public static final int DEFAULT_LIST_LIMIT = 25;
    public static final int MAX_LIST_LIMIT = 100;
    private static final Set<String> SUPPORTED_ALGORITHMS = Set.of(
        "first_available",
        "independent",
        "self_selection",
        "traffic",
        "nearest",
        "First available (naive)",
        "First available courier",
        "Independent acceptance",
        "Couriers choose individually",
        "Self-selection + bonus",
        "Couriers choose with incentives",
        "Traffic-aware dispatch",
        "Traffic-aware assignment"
    );

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

    public List<ExperimentResponse> findAll(Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIST_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIST_LIMIT) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Limit must be between 1 and " + MAX_LIST_LIMIT
            );
        }
        return repository.findAll(limit);
    }

    public ExperimentResponse findById(UUID id) {
        return repository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Experiment not found"));
    }

    private void validateResults(CreateExperimentRequest request) {
        request.results().forEach(result -> {
            if (!SUPPORTED_ALGORITHMS.contains(result.algorithm())) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported dispatch algorithm: " + result.algorithm()
                );
            }
            if (result.couriers() != request.courierCount()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Result courier count must match the experiment courier count"
                );
            }
            if (result.waiting() > result.pending()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Waiting requests cannot exceed pending requests"
                );
            }
            if (result.delivered() > result.assigned()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Delivered requests cannot exceed assigned requests"
                );
            }
            if (result.serviceLevel() > 100 || result.utilization() > 100 || result.rating() > 5) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Result percentages must be <= 100 and rating must be <= 5"
                );
            }
        });
    }
}
