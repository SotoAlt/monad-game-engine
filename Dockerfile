FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci && npm install @rollup/rollup-linux-x64-musl --no-save
COPY . .

# Vite needs these at build time for client bundle
ARG VITE_PRIVY_APP_ID
ARG VITE_PRIVY_CLIENT_ID
ARG VITE_TREASURY_ADDRESS
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
ENV VITE_PRIVY_CLIENT_ID=$VITE_PRIVY_CLIENT_ID
ENV VITE_TREASURY_ADDRESS=$VITE_TREASURY_ADDRESS

RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src ./src
COPY docs ./docs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server/index.js"]
