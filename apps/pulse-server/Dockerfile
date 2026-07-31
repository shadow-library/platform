# Installing the required tools in production build
FROM oven/bun:1.3

# Setting up the environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Stamping the build version onto the image (passed at build time, surfaced at runtime)
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}

# Setting the working directory and user
USER bun
WORKDIR /app

# Copying the files required
COPY dist .

# Running the application
EXPOSE 8080
ENTRYPOINT [ "bun", "run" ]
CMD [ "main.js" ]
