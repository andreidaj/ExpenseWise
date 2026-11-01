FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV API_INTERNAL_URL=http://api:8000
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run

WORKDIR /app

ENV NODE_ENV=production
ENV API_INTERNAL_URL=http://api:8000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts /app/tsconfig.json /app/server.mjs ./

EXPOSE 3000

CMD ["node", "server.mjs"]
