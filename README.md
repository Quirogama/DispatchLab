# DispatchLab

A distributed fleet-dispatch simulation platform for studying resource allocation,
concurrency, and system reliability.

## Stack

- Java 25 LTS
- Spring Boot 3.5.5
- Maven

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
	test/
		java/com/dispatchlab/
			DispatchLabApplicationTests.java
```

The `api`, `application`, `domain`, and `infrastructure` areas can grow as the
simulation capabilities are introduced. The initial HTTP surface is a health
check at `GET /api/health`.

## Run locally

```bash
mvn spring-boot:run
```

Then open `http://localhost:8080/api/health`.

## Verify

```bash
mvn test
```
