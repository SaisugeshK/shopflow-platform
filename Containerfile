# Single-image deployment (GCP / Cloud Run): one jar serves the JSON API and the React web build from the same
# origin — no separate nginx container, no CORS needed for the browser. Build with Podman from the repo root:
#   podman build -t shopflow:local -f Containerfile .
# The local (two-container) Podman stack is unaffected — see podman-compose.yml, backend/Containerfile, web/Containerfile.

# ---- stage 1: web build ----
FROM docker.io/library/node:24-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- stage 2: backend build, with the web build copied in as Spring Boot static resources ----
FROM docker.io/library/maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /src/backend
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
# Anything under src/main/resources/static/ is packaged into the jar and served at "/" (see SpaWebConfig).
COPY --from=web-build /src/web/dist/. ./src/main/resources/static/
RUN mvn -q -B -DskipTests package && cp target/shopflow-backend-*.jar /app.jar

# ---- stage 3: runtime ----
FROM docker.io/library/eclipse-temurin:21-jre-alpine
RUN addgroup -S shopflow && adduser -S shopflow -G shopflow && mkdir -p /data/storage && chown -R shopflow:shopflow /data
WORKDIR /app
COPY --from=backend-build /app.jar /app/app.jar
USER shopflow
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError" \
    STORAGE_LOCAL_ROOT=/data/storage
# Cloud Run sets PORT; local `podman run` without -e PORT falls back to 8080.
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/actuator/health/readiness" | grep -q UP || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=$PORT -jar /app/app.jar"]
