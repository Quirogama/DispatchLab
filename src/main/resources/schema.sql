CREATE TABLE IF NOT EXISTS experiments (
    id VARCHAR(36) PRIMARY KEY,
    seed BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    courier_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    results_json TEXT NOT NULL
);
