FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY server.js ./
ENV POSTGRES_HOST=postgres \
    POSTGRES_PORT=5432 \
    POSTGRES_USER=app \
    POSTGRES_PASSWORD=app \
    POSTGRES_DB=news \
    REDIS_HOST=redis \
    REDIS_PORT=6379 \
    PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
