FROM node:20-slim

RUN apt-get update && apt-get install -y \
    postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 3456
CMD ["node", "server.js"]
