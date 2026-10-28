package com.dispatchlab.api.experiment;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ExperimentResultRequest(
    @NotBlank String algorithm,
    @NotNull @Min(0) Integer couriers,
    @NotNull @Min(0) Integer delivered,
    @NotNull @Min(0) Integer waiting,
    @NotNull @Min(0) Integer pending,
    @NotNull @Min(0) Integer assigned,
    @NotNull @DecimalMin("0.0") Double averageDistance,
    @NotNull @DecimalMin("0.0") Double plannedAverageDistance,
    @NotNull @DecimalMin("0.0") Double averagePickupTime,
    @NotNull @DecimalMin("0.0") Double p95DeliveryTime,
    @NotNull @DecimalMin("0.0") Double serviceLevel,
    @NotNull @DecimalMin("0.0") Double utilization,
    @NotNull @DecimalMin("0.0") Double rating
) {
}
