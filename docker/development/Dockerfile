FROM node:24.17.0-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y git gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

USER node
