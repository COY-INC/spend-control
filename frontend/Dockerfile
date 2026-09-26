# syntax=docker/dockerfile:1.7

FROM node:22.18.0-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG VITE_API_URL=http://localhost:3333
ARG VITE_PLUGGY_CONNECTOR_IDS=""
ARG VITE_INTERNAL_PARTY_PATTERN=""

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_PLUGGY_CONNECTOR_IDS=${VITE_PLUGGY_CONNECTOR_IDS}
ENV VITE_INTERNAL_PARTY_PATTERN=${VITE_INTERNAL_PARTY_PATTERN}

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/dist .
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i '/^user /d; s@pid .*;@pid /tmp/nginx.pid;@' /etc/nginx/nginx.conf

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
