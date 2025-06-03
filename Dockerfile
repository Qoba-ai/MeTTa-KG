# STAGE 1: build API Rust binary
FROM rust:1.86 AS rust-builder

WORKDIR /mettakg

COPY api api

RUN apt-get update && apt-get install -y --no-install-recommends \
    musl-dev \
    g++ \
    libpq-dev \
    libssl-dev \
    pkg-config

RUN rustup target add x86_64-unknown-linux-musl

ENV OPENSSL_STATIC=1
ENV OPENSSL_DIR=/usr
ENV OPENSSL_INCLUDE_DIR=/usr/include
ENV OPENSSL_LIB_DIR=/usr/lib/x86_64-linux-gnu

ENV LIBPQ_STATIC=1

RUN cd api/ && cargo build --release --target x86_64-unknown-linux-musl

# STAGE 2: build and install translation sub-project
FROM python:3.11-alpine AS python-builder

WORKDIR /mettakg

RUN apk add --no-cache \
    gcc g++ musl-dev \
    libffi-dev openssl-dev \
    python3-dev

COPY translations /mettakg/translations

RUN python3 -m venv /mettakg/venv && \
    /mettakg/venv/bin/pip install --no-deps --no-cache-dir -r /mettakg/translations/requirements.txt && \
    /mettakg/venv/bin/pip uninstall -y pip setuptools wheel

# STAGE 3: runtime image
FROM python:3.11.7-alpine3.19

WORKDIR /mettakg

COPY --from=rust-builder /mettakg/api/target/x86_64-unknown-linux-musl/release/api /usr/local/bin/
COPY --from=python-builder /mettakg/venv /mettakg/venv
COPY --from=python-builder /mettakg/translations /mettakg/translations

COPY Rocket.toml .

RUN mkdir -p static temp

ENTRYPOINT ["api"]
