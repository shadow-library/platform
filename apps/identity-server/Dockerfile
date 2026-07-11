# Runs the prebuilt output of `bun run build`; no compiler toolchain ships in the image.
# The tag is version-pinned; CI pins the digest at build time via --build-arg BUN_IMAGE=oven/bun@sha256:...
ARG BUN_IMAGE=oven/bun:1.3.6-slim
FROM ${BUN_IMAGE}

# Setting up the environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Setting the working directory and user
USER bun
WORKDIR /app

# Copying the files required
COPY --chown=bun:bun dist .

# Liveness only; orchestrator readiness uses /health/ready (postgres + redis + active signing key)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "await fetch('http://127.0.0.1:8080/health').then(r => { if (!r.ok) throw new Error(String(r.status)); })"]

# Running the application; the worker process runs the same image with `worker.js`
EXPOSE 8080
ENTRYPOINT [ "bun", "run" ]
CMD [ "main.js" ]
