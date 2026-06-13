# syntax=docker/dockerfile:1

# --- Build stage: compile + package the Spring Boot fat jar ---
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Cache dependencies: resolve them before copying source so edits to src
# don't re-download the world on every build.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# --- Run stage: slim JRE, non-root ---
FROM eclipse-temurin:21-jre-alpine AS run
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
# Single repackaged jar (matches *.jar, excludes *.jar.original)
COPY --from=build /app/target/*.jar app.jar
USER app

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
