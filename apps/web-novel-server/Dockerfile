# Runs the prebuilt output of `bun run build`; no compiler toolchain ships in the image.
FROM oven/bun:1.3

# Setting up the environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Build-time version stamp, surfaced to the running process (defaults to `local` for ad-hoc builds)
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}

# Setting the working directory and user
USER bun
WORKDIR /app

# Copying the files required
COPY --chown=bun:bun dist .

# Liveness only; orchestrator readiness uses /health/ready on the main port or the
# HttpCoreModule health server on :8081 (/health/live, /health/ready)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "await fetch('http://127.0.0.1:8080/health').then(r => { if (!r.ok) throw new Error(String(r.status)); })"]

# Running the application
EXPOSE 8080 8081
ENTRYPOINT [ "bun", "run" ]
CMD [ "main.js" ]
