FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG API_INTERNAL_URL=http://api.railway.internal:8000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run

WORKDIR /app

ARG API_INTERNAL_URL=http://api.railway.internal:8000
ENV NODE_ENV=production
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts /app/tsconfig.json /app/server.mjs ./

EXPOSE 3000

CMD ["node", "server.mjs"]
