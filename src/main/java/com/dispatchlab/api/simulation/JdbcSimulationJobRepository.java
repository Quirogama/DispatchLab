package com.dispatchlab.api.simulation;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JdbcSimulationJobRepository implements SimulationJobRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcSimulationJobRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public SimulationJob save(SimulationJob job) {
        try {
            jdbcTemplate.update(
                """
                INSERT INTO simulation_jobs (
                    id, idempotency_key, seed, duration_seconds, courier_count, request_json,
                    status, worker_id, attempt_count, error_message, result_experiment_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                job.id().toString(),
                job.idempotencyKey(),
                job.seed(),
                job.durationSeconds(),
                job.courierCount(),
                job.requestJson(),
                job.status(),
                job.workerId(),
                job.attemptCount(),
                job.errorMessage(),
                job.resultExperimentId() == null ? null : job.resultExperimentId().toString(),
                Timestamp.from(job.createdAt()),
                Timestamp.from(job.updatedAt())
            );
            return job;
        } catch (DuplicateKeyException exception) {
            throw exception;
        }
    }

    @Override
    public Optional<SimulationJob> findById(UUID id) {
        return jdbcTemplate.query(
            "SELECT * FROM simulation_jobs WHERE id = ?",
            (resultSet, rowNumber) -> map(resultSet),
            id.toString()
        ).stream().findFirst();
    }

    @Override
    public Optional<SimulationJob> findByIdempotencyKey(String idempotencyKey) {
        return jdbcTemplate.query(
            "SELECT * FROM simulation_jobs WHERE idempotency_key = ?",
            (resultSet, rowNumber) -> map(resultSet),
            idempotencyKey
        ).stream().findFirst();
    }

    @Override
    public boolean claim(UUID id, String workerId) {
        return jdbcTemplate.update(
            """
            UPDATE simulation_jobs
            SET status = 'RUNNING',
                worker_id = ?,
                attempt_count = attempt_count + 1,
                updated_at = ?
            WHERE id = ? AND status = 'QUEUED'
            """,
            workerId,
            Timestamp.from(Instant.now()),
            id.toString()
        ) == 1;
    }

    @Override
    public void complete(UUID id, UUID experimentId) {
        jdbcTemplate.update(
            """
            UPDATE simulation_jobs
            SET status = 'COMPLETED',
                result_experiment_id = ?,
                error_message = NULL,
                updated_at = ?
            WHERE id = ?
            """,
            experimentId.toString(),
            Timestamp.from(Instant.now()),
            id.toString()
        );
    }

    @Override
    public void fail(UUID id, String errorMessage) {
        jdbcTemplate.update(
            """
            UPDATE simulation_jobs
            SET status = 'FAILED',
                error_message = ?,
                updated_at = ?
            WHERE id = ?
            """,
            errorMessage,
            Timestamp.from(Instant.now()),
            id.toString()
        );
    }

    private SimulationJob map(ResultSet resultSet) throws SQLException {
        String resultExperimentId = resultSet.getString("result_experiment_id");
        return new SimulationJob(
            UUID.fromString(resultSet.getString("id")),
            resultSet.getString("idempotency_key"),
            resultSet.getLong("seed"),
            resultSet.getInt("duration_seconds"),
            resultSet.getInt("courier_count"),
            resultSet.getString("request_json"),
            resultSet.getString("status"),
            resultSet.getString("worker_id"),
            resultSet.getInt("attempt_count"),
            resultSet.getString("error_message"),
            resultExperimentId == null ? null : UUID.fromString(resultExperimentId),
            resultSet.getTimestamp("created_at").toInstant(),
            resultSet.getTimestamp("updated_at").toInstant()
        );
    }
}
