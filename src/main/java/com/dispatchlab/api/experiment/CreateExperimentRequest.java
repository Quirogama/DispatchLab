package com.dispatchlab.api.experiment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateExperimentRequest(
    @NotNull @Min(0) Long seed,
    @NotNull @Min(1) @Max(1000) Integer durationSeconds,
    @NotNull @Min(0) @Max(100) Integer courierCount,
    @NotEmpty List<@Valid ExperimentResultRequest> results
) {
}
