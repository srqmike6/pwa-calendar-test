FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package configurations first to optimize build caching
COPY package*.json ./
RUN npm install --only=production

# Copy the server script and your public frontend assets
COPY server.js ./
COPY public/ ./public/

EXPOSE 80

CMD [ "node", "server.js" ]
