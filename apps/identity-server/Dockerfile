# Installing the required tools in production build
FROM oven/bun:1.3

# Setting up the environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Setting the working directory and user
USER bun
WORKDIR /app

# Copying the files required
COPY dist .

# Running the application
EXPOSE 8080
ENTRYPOINT [ "bun", "run", "main.js" ]
