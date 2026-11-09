# Voice AI admin portal: static build served by Caddy, which forwards /api/admin/* (and only
# that) to the backend (BACKEND_URL).
FROM node:22.22.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Railway sets PORT; BACKEND_URL is e.g. http://voice-ai-api.railway.internal:4000
ENV PORT=8080
EXPOSE 8080
