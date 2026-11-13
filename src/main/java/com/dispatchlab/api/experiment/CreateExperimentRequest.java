package com.dispatchlab.api.experiment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateExperimentRequest(
    @NotNull @Min(0) Long seed,
    @NotNull @Min(1) @Max(3600) Integer durationSeconds,
    @NotNull @Min(1) @Max(100) Integer courierCount,
    @NotEmpty @Size(max = 10) List<@Valid ExperimentResultRequest> results
) {
}
