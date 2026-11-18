CREATE TABLE IF NOT EXISTS experiments (
    id VARCHAR(36) PRIMARY KEY,
    seed BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    courier_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_jobs (
    id VARCHAR(36) PRIMARY KEY,
    idempotency_key VARCHAR(128),
    seed BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    courier_count INTEGER NOT NULL,
    request_json TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    worker_id VARCHAR(128),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    result_experiment_id VARCHAR(36),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simulation_jobs_idempotency
    ON simulation_jobs(idempotency_key);
