FROM python:3.12-slim

ARG BBP_VERSION=v6.0.0
ENV BBP_PAIRINGS_EXE=/opt/bbpPairings/bbpPairings
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /opt/bbpPairings \
  && curl -L "https://github.com/BieremaBoyzProgramming/bbpPairings/releases/download/${BBP_VERSION}/bbpPairings-${BBP_VERSION}-x86_64-pc-linux.tar.gz" \
    | tar -xz -C /opt/bbpPairings --strip-components=1 \
  && chmod +x /opt/bbpPairings/bbpPairings

COPY pairing.html pairing.css pairing.js ./
COPY server ./server

EXPOSE 3000

CMD ["python", "server/local_server.py"]
