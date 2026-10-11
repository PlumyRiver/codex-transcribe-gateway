FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY LICENSE NOTICE ./
COPY LICENSES ./LICENSES
RUN mkdir /data && chown node:node /data
ENV DATA_DIR=/data HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node", "src/main.mjs"]
