package com.dispatchlab.api.experiment;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/experiments")
public class ExperimentController {
    private final ExperimentService service;

    public ExperimentController(ExperimentService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ExperimentResponse> create(@Valid @RequestBody CreateExperimentRequest request) {
        var experiment = service.create(request);
        return ResponseEntity.created(
            java.net.URI.create("/api/experiments/" + experiment.id())
        ).body(experiment);
    }

    @GetMapping
    public List<ExperimentResponse> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ExperimentResponse findById(@PathVariable UUID id) {
        return service.findById(id);
    }
}
