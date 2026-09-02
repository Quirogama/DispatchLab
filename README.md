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
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-25.0.4.7-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

mvn spring-boot:run
```

Then open:

```text
http://localhost:8080
```

## Verify

```bash
mvn test
```
