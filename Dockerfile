FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

FROM deps AS builder
COPY tsconfig.json ./
COPY prisma/ ./prisma/
COPY src/ ./src/

# Generate Prisma client + build TypeScript
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production dependencies
COPY package*.json ./
RUN npm install --ignore-scripts --omit=dev && npm cache clean --force

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + migrations + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Startup script: run migrations then start app
RUN printf '#!/bin/sh\nset -e\nnpx prisma migrate deploy\nexec node dist/server.js\n' > /start.sh \
  && chmod +x /start.sh

EXPOSE 8080
CMD ["/start.sh"]
