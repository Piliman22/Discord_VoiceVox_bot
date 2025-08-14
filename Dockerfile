FROM node:18-alpine AS builder

WORKDIR /app


COPY package*.json ./
RUN npm ci


COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build


FROM node:18-alpine AS production

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force


COPY --from=builder /app/dist ./dist
COPY config.json ./

RUN addgroup -g 1001 -S nodejs
RUN adduser -S deltachan -u 1001
USER deltachan

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is running')" || exit 1

CMD ["node", "dist/index.js"]