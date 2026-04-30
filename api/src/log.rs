use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn setup_logging() -> Option<WorkerGuard> {
    std::env::set_var("ROCKET_CLI_COLORS", "0");

    let is_prod = crate::config::config().env == "production";
    let file_appender = tracing_appender::rolling::daily("./logs", "production.log");

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "warn,api=info,rocket=error,diesel=warn".into());

    let registry = tracing_subscriber::registry().with(filter);

    if is_prod {
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

        registry
            .with(fmt::layer().json().with_writer(non_blocking))
            .with(fmt::layer().compact())
            .init();

        Some(guard)
    } else {
        registry
            .with(fmt::layer().json().with_writer(file_appender))
            .with(fmt::layer().pretty())
            .init();

        None
    }
}
