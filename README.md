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
        index.html
        styles.css
  test/
    java/com/dispatchlab/
      DispatchLabApplicationTests.java
```

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
node --test dispatch-logic.test.mjs
.\mvnw.cmd test
docker build --tag dispatchlab:ci .
```
