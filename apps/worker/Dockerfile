FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY index.js ./
ENV KAFKA_BROKER=redpanda:9092 \
    SNAPSHOT_FETCH_BASE=http://nginx
CMD ["node", "index.js"]
