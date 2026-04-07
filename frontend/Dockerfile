# ============================================================
# frontend/Dockerfile — React + Vite (multi-stage)
# Stage 1: build the static assets with Vite
# Stage 2: serve with Nginx (no Node runtime in final image)
# ============================================================

# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL is baked in at build time if you ever need an absolute URL.
# For now the nginx proxy handles /api → backend so it stays empty.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/api/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
