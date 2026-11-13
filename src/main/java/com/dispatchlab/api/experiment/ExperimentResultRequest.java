package com.dispatchlab.api.experiment;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ExperimentResultRequest(
    @NotBlank @Size(max = 64) String algorithm,
    @NotNull @Min(0) @Max(100) Integer couriers,
    @NotNull @Min(0) @Max(100000) Integer delivered,
    @NotNull @Min(0) @Max(100000) Integer waiting,
    @NotNull @Min(0) @Max(100000) Integer pending,
    @NotNull @Min(0) @Max(100000) Integer assigned,
    @NotNull @DecimalMin("0.0") Double averageDistance,
    @NotNull @DecimalMin("0.0") Double plannedAverageDistance,
    @NotNull @DecimalMin("0.0") Double averagePickupTime,
    @NotNull @DecimalMin("0.0") Double p95DeliveryTime,
    @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Double serviceLevel,
    @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Double utilization,
    @NotNull @DecimalMin("0.0") @DecimalMax("5.0") Double rating
) {
}
