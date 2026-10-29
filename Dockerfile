# Two stages: the build stage compiles TypeScript and prunes to production dependencies; the
# runtime stage is distroless, so production has no shell or package manager (ADR-002).

FROM node:25-trixie-slim@sha256:aabbe39553d15ede8a97cc60c9e1a97034ff772afcf696ea42b94e7f5f2ec71b AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN --mount=type=cache,target=/root/.yarn/berry/cache yarn install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN --mount=type=cache,target=/root/.yarn/berry/cache yarn build && yarn workspaces focus --production

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91
ARG VERSION=0.0.0-dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="posts-api" \
      org.opencontainers.image.description="HTTP API for posts and their categories, backed by MySQL" \
      org.opencontainers.image.source="https://github.com/lucrambo/infrastructure-interview-test" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"
ENV NODE_ENV=production
WORKDIR /app
# Files stay owned by root: the service user can read them but never change them.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER 65532:65532
EXPOSE 3000
# The base image's entrypoint is node; migrations run with
# `node_modules/typeorm/cli.js migration:run -d dist/data-source.js` as arguments.
CMD ["dist/server.js"]
