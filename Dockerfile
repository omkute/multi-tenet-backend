FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM deps AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
