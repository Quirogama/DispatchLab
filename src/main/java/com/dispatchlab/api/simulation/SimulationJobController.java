package com.dispatchlab.api.simulation;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/simulation-jobs")
public class SimulationJobController {
    private final SimulationJobService service;

    public SimulationJobController(SimulationJobService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<SimulationJobResponse> submit(
        @Valid @RequestBody SimulationJobRequest request,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        var job = service.submit(request, idempotencyKey);
        return ResponseEntity.accepted()
            .location(URI.create("/api/v1/simulation-jobs/" + job.id()))
            .body(job);
    }

    @GetMapping("/{id}")
    public SimulationJobResponse get(@PathVariable UUID id) {
        return service.get(id);
    }
}
