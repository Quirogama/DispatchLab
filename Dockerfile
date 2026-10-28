FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN mvn -q package

FROM eclipse-temurin:25-jdk
WORKDIR /app
COPY --from=build /workspace/target/*.jar app.jar
RUN groupadd --system dispatchlab && useradd --system --gid dispatchlab dispatchlab
USER dispatchlab
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
