FROM debian:bookworm-slim

ARG DUCKDB_VERSION=v1.4.1
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && ARCH=$(case "${TARGETARCH:-amd64}" in arm64) echo "aarch64";; *) echo "amd64";; esac) \
    && curl -sL "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-${ARCH}.zip" \
       -o /tmp/duckdb.zip \
    && unzip /tmp/duckdb.zip -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/duckdb \
    && rm /tmp/duckdb.zip \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /data
ENTRYPOINT ["duckdb"]
