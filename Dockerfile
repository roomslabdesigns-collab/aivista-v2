# AIVista production image: builds the React UI, then serves UI + API from one Node process.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  # Headless Chromium for crawling JavaScript-heavy websites (optional; ~300 MB).
  && npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
# SQLite lives here; mount a persistent volume at /app/data (or set DATABASE_URL to Turso).
RUN mkdir -p data
EXPOSE 3001
CMD ["npm", "start"]
