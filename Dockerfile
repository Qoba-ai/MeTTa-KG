FROM rust:1.81

WORKDIR /usr/src/mettakg

RUN apt-get update
RUN apt-get install -y python3-pip python3.11-venv

COPY ./api/ ./api/
COPY ./translations/ ./translations/
COPY ./Rocket.toml ./

RUN python3 -m venv ./venv
RUN ./venv/bin/pip install -r translations/requirements.txt
RUN --mount=type=ssh,id=default cargo install --path ./api/

EXPOSE 8000

RUN mkdir /usr/src/mettakg/temp

CMD ["api"]
