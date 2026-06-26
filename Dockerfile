FROM node:20-slim

# Add pgdg repo for PostgreSQL 18
RUN apt-get update && apt-get install -y curl gnupg2 lsb-release \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg \
    && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

ENV PGSSLMODE=require

# Ensure pg_dump is in PATH
RUN ln -sf /usr/lib/postgresql/18/bin/pg_dump /usr/local/bin/pg_dump \
    && ln -sf /usr/lib/postgresql/18/bin/psql /usr/local/bin/psql

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 3456
CMD ["node", "server.js"]
