# ---------- RentNest web (static SPA served by nginx) ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --ignore-scripts || npm install --workspace client --ignore-scripts
COPY client client
ARG VITE_API_URL=""
ARG VITE_PLATFORM_NAME=RentNest
ARG VITE_MAPBOX_TOKEN=""
ENV VITE_API_URL=$VITE_API_URL VITE_PLATFORM_NAME=$VITE_PLATFORM_NAME VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
RUN cd client && npx vite build

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
