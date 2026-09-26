# Production image. Debian slim (not alpine): bcrypt's prebuilt binary and the static ffmpeg/ffprobe
# binaries shipped by ffmpeg-static / ffprobe-static expect glibc.

FROM node:22-slim AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# multer and ffmpeg write work files here, so the unprivileged user needs write access
RUN mkdir -p public/temps && chown -R node:node public
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/v1/healthcheck').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
