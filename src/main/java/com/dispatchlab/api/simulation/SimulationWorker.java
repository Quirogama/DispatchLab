package com.dispatchlab.api.simulation;

import com.dispatchlab.api.experiment.ExperimentRepository;
import com.dispatchlab.api.experiment.ExperimentResponse;
import com.dispatchlab.api.experiment.ExperimentResultRequest;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.File;
import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@ConditionalOnProperty(name = "dispatchlab.worker.enabled", havingValue = "true")
public class SimulationWorker {
    private final SimulationJobRepository jobRepository;
    private final ExperimentRepository experimentRepository;
    private final ObjectMapper objectMapper;
    private final Counter completedJobs;
    private final Counter failedJobs;
    private final String workerId;

    public SimulationWorker(
        SimulationJobRepository jobRepository,
        ExperimentRepository experimentRepository,
        ObjectMapper objectMapper,
        MeterRegistry meterRegistry
    ) throws Exception {
        this.jobRepository = jobRepository;
        this.experimentRepository = experimentRepository;
        this.objectMapper = objectMapper;
        this.completedJobs = meterRegistry.counter("dispatchlab.jobs.completed");
        this.failedJobs = meterRegistry.counter("dispatchlab.jobs.failed");
        this.workerId = InetAddress.getLocalHost().getHostName();
    }

    @RabbitListener(queues = SimulationRabbitConfig.QUEUE)
    public void execute(String jobId) {
        UUID id = UUID.fromString(jobId);
        if (!jobRepository.claim(id, workerId)) {
            return;
        }

        try {
            var job = jobRepository.findById(id)
                .orElseThrow(() -> new IllegalStateException("Claimed simulation job was not found"));
            var request = objectMapper.readValue(job.requestJson(), SimulationJobRequest.class);
            var results = runNode(request);
            var experiment = new ExperimentResponse(
                UUID.randomUUID(),
                request.seed(),
                request.durationSeconds(),
                request.courierCount(),
                Instant.now(),
                results
            );
            experimentRepository.save(experiment);
            jobRepository.complete(id, experiment.id());
            completedJobs.increment();
        } catch (Exception exception) {
            jobRepository.fail(id, truncate(exception.getMessage()));
            failedJobs.increment();
        }
    }

    private List<ExperimentResultRequest> runNode(SimulationJobRequest request) throws Exception {
        var process = new ProcessBuilder("node", "scripts/run-simulation.mjs")
            .directory(new File(System.getProperty("user.dir")))
            .redirectErrorStream(false)
            .start();

        try (var input = process.getOutputStream()) {
            input.write(objectMapper.writeValueAsBytes(request));
        }

        if (!process.waitFor(Duration.ofSeconds(300).toSeconds(), TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Simulation exceeded the 300-second timeout");
        }
        if (process.exitValue() != 0) {
            String error = new String(process.getErrorStream().readAllBytes());
            throw new IllegalStateException("Simulation worker failed: " + error);
        }

        return objectMapper.readValue(
            process.getInputStream(),
            new TypeReference<List<ExperimentResultRequest>>() {}
        );
    }

    private String truncate(String message) {
        if (message == null) return "Simulation execution failed";
        return message.length() > 2000 ? message.substring(0, 2000) : message;
    }
}
