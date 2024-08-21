FROM rust:1.80-bullseye

WORKDIR /usr/src/mettakg

RUN apt-get update
RUN apt-get install -y python3-pip

COPY ./api/ ./api/
COPY ./translations/ ./translations/
COPY ./Rocket.toml ./

RUN pip3 install -r translations/requirements.txt
RUN cargo install --path ./api/

EXPOSE 8000

CMD ["api"]
