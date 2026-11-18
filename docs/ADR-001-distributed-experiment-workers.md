# ADR-001: Asynchronous Experiment Execution

## Status

Accepted

## Context

The browser engine is deterministic and useful for interactive comparisons,
but benchmark execution must also be repeatable without an open browser.
As simulation volume grows, synchronous HTTP execution creates timeouts,
uneven resource usage and no durable recovery record.

## Decision

DispatchLab will use:

- a Spring Boot API as the command boundary;
- PostgreSQL for job and experiment state;
- RabbitMQ as a durable work queue;
- stateless worker replicas for simulation execution;
- the existing JavaScript engine as the simulation implementation.

## Why This Is Enough

The architecture introduces concurrency and asynchronous processing without
fragmenting the domain into prematurely small services. A worker receives a
job ID, reloads the immutable request and returns a persisted result.

## Consequences

- HTTP submission becomes fast and retryable.
- Workers can scale independently.
- Browser and worker execution must remain behaviorally compatible.
- Job state is visible while work is queued or running.
- PostgreSQL and RabbitMQ become critical operational dependencies.

## Alternatives Rejected

- Direct synchronous benchmark API: poor scalability and timeout behavior.
- Browser-only processing: not durable or horizontally executable.
- Kafka: unnecessary operational complexity for low-volume local jobs.
- Separate worker language and engine: duplicated domain logic and drift risk.
