# STAGE 1: build API Rust binary
FROM rust:1.95 AS rust-builder

WORKDIR /usr/src/mettakg

COPY api api

RUN cd api/ && cargo build --release

# STAGE 2: runtime image
FROM python:3.11-slim

WORKDIR /usr/src/mettakg

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY translations translations

RUN python3 -m pip install --no-cache-dir -r translations/requirements.txt

COPY --from=rust-builder /usr/src/mettakg/api/target/release/api /usr/local/bin/

COPY Rocket.toml .

RUN mkdir -p static temp

EXPOSE 8000

ENTRYPOINT ["api"]
