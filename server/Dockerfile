FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm ci --workspace=server

COPY server ./server
RUN npm run build -w server

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY server/src/db ./server/src/db

EXPOSE 4000

CMD ["node", "server/dist/server.js"]
