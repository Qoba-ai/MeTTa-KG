use std::env;
use std::sync::OnceLock;

static CONFIG: OnceLock<Config> = OnceLock::new();

/// Returns a reference to the global config.
/// Panics if `Config::load()` has not been called first.
pub fn config() -> &'static Config {
    CONFIG.get().expect("Config::load() must be called before config()")
}

#[derive(Debug, Clone)]
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
    /// Directory containing the Python translation scripts.
    /// Set via TRANSLATIONS_RELATIVE_PATH; defaults to "translations/src".
    pub translations_path: String,
}

impl Config {
    /// Load config from environment variables, storing it in a global.
    /// Exits the process with a clear error message if any required variable is missing.
    pub fn load() -> &'static Config {
        CONFIG.get_or_init(|| {
            Self::build().unwrap_or_else(|missing| {
                eprintln!("ERROR: Required environment variable '{missing}' is not set. Shutting down.");
                std::process::exit(1);
            })
        })
    }

    fn build() -> Result<Self, String> {
        let require = |key: &str| env::var(key).map_err(|_| key.to_string());

        Ok(Config {
            mork_url: require("METTA_KG_MORK_URL")?,
            database_url: require("METTA_KG_DATABASE_URL")?,
            origin_url: require("METTA_KG_ORIGIN_URL")?,
            frontend_url: require("METTA_KG_FRONTEND_URL")?,
            port: require("METTA_KG_PORT")?
                .parse::<u32>()
                .map_err(|_| "METTA_KG_PORT (must be a number)".to_string())?,
            secret: require("METTA_KG_SECRET")?,
            address: require("METTA_KG_ADDRESS")?,
            allowed_origins: require("METTA_KG_ALLOWED_ORIGINS")?,
            env: require("METTA_KG_ENV")?,
            translations_path: env::var("TRANSLATIONS_RELATIVE_PATH")
                .unwrap_or_else(|_| "translations/src".to_string()),
        })
    }
}
