# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT (not frontend/), because stage 2 needs to
# COPY nginx/conf.d/vdt.conf which lives outside frontend/. See docker-compose.yml
# nginx service: build.context: ., build.dockerfile: frontend/Dockerfile.

# --- Build stage: compile the React app ---
FROM node:22-alpine AS build
WORKDIR /app

# Cache dependencies: resolve them before copying source so edits to src
# don't re-install the world on every build.
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/. .
RUN npm run build

# --- Run stage: serve the built SPA + reverse-proxy /api, /ws via nginx ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/conf.d/vdt.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
