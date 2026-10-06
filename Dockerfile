FROM node:20-slim
RUN apt-get update && apt-get install -y ghostscript inkscape && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm install --only=prod
COPY . .
EXPOSE 10000
CMD ["node", "server.js"]
