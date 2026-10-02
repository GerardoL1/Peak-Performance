FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server --omit=dev
COPY server/ server/
WORKDIR /app/server
ENV NODE_ENV=production COOKIE_SECURE=false
USER node
EXPOSE 5000
CMD ["node", "src/index.js"]
