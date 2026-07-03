FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server/app.js"]
