FROM rust:1.70

WORKDIR /usr/src/mettakg
COPY . .

RUN cargo install --path .

CMD ["api"]
