FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY .env.example ./
COPY README.md ./

EXPOSE 3000

CMD ["node", "src/app.js"]
