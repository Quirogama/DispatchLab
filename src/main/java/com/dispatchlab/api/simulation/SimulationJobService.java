package com.dispatchlab.api.simulation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.UUID;

@Service
public class SimulationJobService {
    private final SimulationJobRepository repository;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    public SimulationJobService(
        SimulationJobRepository repository,
        RabbitTemplate rabbitTemplate,
        ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
    }

    public SimulationJobResponse submit(SimulationJobRequest request, String idempotencyKey) {
        if (idempotencyKey != null) {
            var existing = repository.findByIdempotencyKey(idempotencyKey);
            if (existing.isPresent()) {
                return toResponse(existing.get());
            }
        }

        String requestJson;
        try {
            requestJson = objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize simulation job", exception);
        }

        var now = Instant.now();
        var job = new SimulationJob(
            UUID.randomUUID(),
            idempotencyKey,
            request.seed(),
            request.durationSeconds(),
            request.courierCount(),
            requestJson,
            "QUEUED",
            null,
            0,
            null,
            null,
            now,
            now
        );

        try {
            repository.save(job);
        } catch (DuplicateKeyException exception) {
            if (idempotencyKey == null) throw exception;
            return repository.findByIdempotencyKey(idempotencyKey)
                .map(this::toResponse)
                .orElseThrow(() -> exception);
        }

        rabbitTemplate.convertAndSend(
            SimulationRabbitConfig.EXCHANGE,
            SimulationRabbitConfig.ROUTING_KEY,
            job.id().toString()
        );
        return toResponse(job);
    }

    public SimulationJobResponse get(UUID id) {
        return repository.findById(id)
            .map(this::toResponse)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Simulation job not found"));
    }

    private SimulationJobResponse toResponse(SimulationJob job) {
        return new SimulationJobResponse(
            job.id(),
            job.status(),
            job.attemptCount(),
            job.errorMessage(),
            job.resultExperimentId(),
            job.createdAt(),
            job.updatedAt()
        );
    }
}
