use std::env;

use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub mork_url: String,
    pub database_url: String,
    pub origin_url: String,
    pub frontend_url: String,
    pub port: u32,
    pub secret: String,
    pub address: String,
    pub allowed_origins: String,
    pub env: String,
}

#[derive(Debug, Deserialize, Clone)]
pub enum ConfigError {
    Missing(String),
}

impl Config {
    pub fn new() -> Result<Self, ConfigError> {
        let get_env = |key: &str| env::var(key).map_err(|_| ConfigError::Missing(key.to_string()));

        Ok(Config {
            mork_url: get_env("METTA_KG_MORK_URL")?,
            database_url: get_env("METTA_KG_DATABASE_URL")?,
            origin_url: get_env("METTA_KG_ORIGIN_URL")?,
            frontend_url: get_env("METTA_KG_FRONTEND_URL")?,
            port: get_env("METTA_KG_PORT")?
                .parse::<u32>()
                .map_err(|_| ConfigError::Missing(String::from("METTA_KG_PORT")))?,
            secret: get_env("METTA_KG_SECRET")?,
            address: get_env("METTA_KG_ADDRESS")?,
            allowed_origins: get_env("METTA_KG_ALLOWED_ORIGINS")?,
            env: get_env("METTA_KG_ENV")?,
        })
    }
}
