FROM alpine:3.21

ARG DUCKDB_VERSION=v1.2.1
ARG TARGETARCH

RUN apk add --no-cache curl unzip \
    && ARCH=$(case "${TARGETARCH:-amd64}" in arm64) echo "aarch64";; *) echo "amd64";; esac) \
    && curl -sL "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-${ARCH}.zip" \
       -o /tmp/duckdb.zip \
    && unzip /tmp/duckdb.zip -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/duckdb \
    && rm /tmp/duckdb.zip

WORKDIR /data
ENTRYPOINT ["duckdb"]
