# DispatchLab

A lightweight urban dispatch simulation for testing routing, congestion, and real-time fleet behavior.

## Stack

- Java 25
- Spring Boot 3.5.5
- Maven
- Docker

## Project structure

```text
src/
  main/
    java/com/dispatchlab/
      DispatchLabApplication.java
      api/
        HealthController.java
    resources/
      application.yml
      static/
        app.js
        metrics.js
        dispatch-logic.js
        index.html
        simulator.html
        styles.css
  test/
    java/com/dispatchlab/
      DispatchLabApplicationTests.java
tests/
  dispatch-logic.test.mjs
  metrics.test.mjs
```

The repository root intentionally contains only project-level files: build
configuration, container setup, the Maven wrapper, and the JavaScript test
entry points. Application code remains under `src/`, while project
documentation lives under `docs/`.

## Run with Docker (recommended)

From the project root:

```bash
copy .env.example .env
# Replace the local database password in .env if desired
docker compose up --build
```

Compose reads database credentials from `.env`; credentials are intentionally
not stored in the repository. On macOS/Linux, use `cp .env.example .env`
instead of `copy`.

Then open:

```text
http://localhost:8080
```

The application sends `Cache-Control: no-store` for its HTML, CSS, and
JavaScript resources, so a normal browser refresh requests the current files.
The container still needs to rebuild when source files change; use the watch
launcher below for that automatic rebuild.

### Automatic updates while developing

To keep the container running and automatically rebuild the application after
changes to Java, HTML, CSS, or JavaScript files, use:

```bash
docker compose watch
```

On Windows, double-click `watch.bat`. This watches `src/`, `pom.xml`, and the
Dockerfile, then rebuilds and restarts the application container when a
relevant file changes. The PostgreSQL volume is preserved.

### Windows one-click launcher

Double-click `run.bat` in the project folder. It builds and starts the app with
Docker Compose. Keep the window open while using DispatchLab; press `Ctrl+C` to
stop it.

## Alternative: local run with Maven

If you prefer to run it directly on your machine:

```bash
.\mvnw.cmd spring-boot:run
```

Then open:

```text
http://localhost:8080
```

## Verify

```bash
.\mvnw.cmd test
```

The project targets Java 25. The Maven Wrapper downloads the pinned Maven
version so the build does not depend on a global Maven installation.

The same checks run in GitHub Actions on every push and pull request:

```bash
node --test tests/dispatch-logic.test.mjs tests/metrics.test.mjs
.\mvnw.cmd test
docker build --tag dispatchlab:ci .
```

The JavaScript suite can also be run through the project scripts:

```bash
npm run build
npm test
```

The simulation engine is deterministic for a given seed and scenario. Policy
comparisons pre-generate the same request workload for every strategy, then
advance each run for the same simulated duration. This prevents a faster
policy from accidentally receiving a different demand stream.

After a comparison finishes, use **Open analysis dashboard** to open the
standalone `/dashboard.html` operations view. It presents throughput and
quality charts, a complete trade-off matrix, and automatically generated
insights. The latest comparison is kept in browser `localStorage`, so it
remains available in the same browser session, and can be exported as JSON.

## Experiment API

The simulator can save recorded runs through Spring Boot:

```text
POST /api/experiments
GET  /api/experiments?limit=25
GET  /api/experiments/{id}
```

`limit` defaults to 25 and is capped at 100. The API rejects unsupported
dispatch algorithms, inconsistent courier counts, impossible waiting/pending
relationships, and invalid metric ranges with structured `400` responses.

Experiment results are persisted in PostgreSQL when the application is run with
Docker Compose. The JDBC repository is behind an interface so the storage
boundary can evolve without changing the API or service layer. Tests use an
isolated in-memory H2 database.

## Distributed experiment jobs

For repeatable benchmark execution outside the browser, submit a job:

```text
POST /api/v1/simulation-jobs
Idempotency-Key: benchmark-90210
```

The API validates the scenario, persists a `QUEUED` job, and publishes it to
RabbitMQ. Stateless worker replicas claim and execute the job, persist the
experiment result, and expose the final state:

```text
GET /api/v1/simulation-jobs/{id}
```

The job lifecycle is `QUEUED -> RUNNING -> COMPLETED | FAILED`. PostgreSQL
controls idempotency and worker claims, while RabbitMQ decouples submission
from CPU-intensive execution. The Docker Compose stack starts two
`simulation-worker` replicas by default.

See [the architecture guide](docs/ARCHITECTURE.md) and
[ADR-001](docs/ADR-001-distributed-experiment-workers.md) for the concurrency,
consistency and trade-off decisions.

The Compose setup creates a named PostgreSQL volume, so saved experiments
survive application restarts. To remove local data intentionally, run
`docker compose down -v`.

The public demo does not require an account. Experiment submissions are
validated server-side, result history queries are capped to 100 records, and
the service exposes separate liveness and database readiness checks:

```text
GET /api/health
GET /api/health/ready
```

The demo is intentionally anonymous for fast portfolio review. A future
multi-user deployment should add identity, ownership, rate limiting, and
managed secret storage before exposing experiment history as a shared service.

For local Maven commands on Windows, Java 25 is required. The repository
includes a VS Code JDK configuration and a `.java-version` file. Verify or
repair the local Java environment with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-java.ps1 -SetEnvironment
```

Close and reopen the terminal after changing `JAVA_HOME`. Then verify Maven:

```powershell
java -version
.\mvnw.cmd --version
.\mvnw.cmd test
```
