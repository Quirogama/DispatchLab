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
docker compose up --build
```

Then open:

```text
http://localhost:8080
```

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

For local Maven commands on Windows, make sure `JAVA_HOME` points to a JDK 25
installation. A Java runtime without `javac`, or a Java 8 shim earlier in
`PATH`, will make Maven fail during test compilation.
