FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server-prod.mjs"]
