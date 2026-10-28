package com.dispatchlab.api.experiment;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JdbcExperimentRepository implements ExperimentRepository {
    private static final TypeReference<List<ExperimentResultRequest>> RESULTS_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcExperimentRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public ExperimentResponse save(ExperimentResponse experiment) {
        try {
            jdbcTemplate.update(
                """
                INSERT INTO experiments (id, seed, duration_seconds, courier_count, created_at, results_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                experiment.id().toString(),
                experiment.seed(),
                experiment.durationSeconds(),
                experiment.courierCount(),
                java.sql.Timestamp.from(experiment.createdAt()),
                objectMapper.writeValueAsString(experiment.results())
            );
            return experiment;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize experiment results", exception);
        }
    }

    @Override
    public List<ExperimentResponse> findAll() {
        return jdbcTemplate.query(
            "SELECT id, seed, duration_seconds, courier_count, created_at, results_json " +
                "FROM experiments ORDER BY created_at DESC",
            (resultSet, rowNumber) -> map(resultSet)
        );
    }

    @Override
    public Optional<ExperimentResponse> findById(UUID id) {
        return jdbcTemplate.query(
            "SELECT id, seed, duration_seconds, courier_count, created_at, results_json " +
                "FROM experiments WHERE id = ?",
            (resultSet, rowNumber) -> map(resultSet),
            id.toString()
        ).stream().findFirst();
    }

    private ExperimentResponse map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        try {
            return new ExperimentResponse(
                UUID.fromString(resultSet.getString("id")),
                resultSet.getLong("seed"),
                resultSet.getInt("duration_seconds"),
                resultSet.getInt("courier_count"),
                resultSet.getTimestamp("created_at").toInstant(),
                objectMapper.readValue(resultSet.getString("results_json"), RESULTS_TYPE)
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not deserialize experiment results", exception);
        }
    }
}
