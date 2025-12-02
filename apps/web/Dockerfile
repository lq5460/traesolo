FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY pages ./pages
ENV NEXT_PUBLIC_API_BASE=http://localhost:3000
EXPOSE 3001
CMD ["npx", "next", "dev", "-p", "3001"]
