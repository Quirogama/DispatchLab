package com.dispatchlab.api.simulation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SimulationJobRequest(
    @NotNull @Min(0) Long seed,
    @NotNull @Min(1) @Max(3600) Integer durationSeconds,
    @NotNull @Min(1) @Max(100) Integer courierCount,
    @NotNull @Valid Grid grid,
    @NotEmpty @Size(max = 20) List<@Valid Point> depots,
    @NotNull @Min(1) @Max(300) Integer demandDelay,
    @NotEmpty @Size(max = 10) List<@NotBlank @Size(max = 64) String> algorithms,
    @NotNull @Min(100) @Max(60000) Integer stepMilliseconds
) {
    public record Grid(
        @NotNull @Min(2) @Max(50) Integer columns,
        @NotNull @Min(2) @Max(50) Integer rows
    ) {
    }

    public record Point(
        @NotNull @Min(0) Integer x,
        @NotNull @Min(0) Integer y
    ) {
    }
}
