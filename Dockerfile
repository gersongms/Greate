FROM node:22-slim

# sharp traz binario proprio; so faltam as libs de sistema que ele usa.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY editorial ./editorial

# data/ e volume: guarda a sessao do WhatsApp, o banco e as fotos.
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "src/index.js"]
