use std::path::Path;
use tokio::sync::mpsc;
use tracing::{Event, Subscriber};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, layer::Context, prelude::*, EnvFilter, Layer};

// ─── MeTTa atom formatting ────────────────────────────────────────────────────

/// Escape backslashes and double-quotes so the string is safe inside a MeTTa
/// double-quoted atom literal.
fn escape_metta(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

// ─── Field visitor ────────────────────────────────────────────────────────────

/// Collects the `message` field (and any extra structured fields) from a
/// tracing `Event`.
#[derive(Default)]
struct EventVisitor {
    message: String,
    extras: Vec<(String, String)>,
}

impl tracing::field::Visit for EventVisitor {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_owned();
        } else {
            self.extras.push((field.name().to_owned(), value.to_owned()));
        }
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        let s = format!("{value:?}");
        if field.name() == "message" {
            // Strip surrounding quotes added by the Debug impl for &str
            self.message = s.trim_matches('"').to_owned();
        } else {
            self.extras.push((field.name().to_owned(), s));
        }
    }
}

// ─── Background flush task ────────────────────────────────────────────────────

async fn mork_log_worker(mork_url: String, mut rx: mpsc::UnboundedReceiver<String>) {
    use tokio::time::{interval, Duration};

    let client = mork_client::MorkClient::new(mork_url);
    let mut buffer: Vec<String> = Vec::new();
    let mut tick = interval(Duration::from_millis(500));

    loop {
        tokio::select! {
            atom = rx.recv() => {
                match atom {
                    Some(a) => {
                        buffer.push(a);
                        if buffer.len() >= 50 {
                            flush(&client, &mut buffer).await;
                        }
                    }
                    None => {
                        // Channel closed — flush remaining entries and stop.
                        if !buffer.is_empty() {
                            flush(&client, &mut buffer).await;
                        }
                        break;
                    }
                }
            }
            _ = tick.tick() => {
                if !buffer.is_empty() {
                    flush(&client, &mut buffer).await;
                }
            }
        }
    }
}

async fn flush(client: &mork_client::MorkClient, buffer: &mut Vec<String>) {
    let body = buffer.join("\n");
    buffer.clear();
    // Errors are intentionally swallowed — logging failures must never crash
    // the server, and we cannot log them (that would recurse).
    let _ = client
        .upload(Path::new("logs"), "$", "$", &body)
        .await;
}

// ─── Layer ────────────────────────────────────────────────────────────────────

/// A [`tracing_subscriber::Layer`] that writes log events to MORK under the
/// `logs/` prefix as MeTTa atoms:
///
/// ```text
/// (log <LEVEL> "<target>" "<timestamp>" "<message>")
/// ```
///
/// Entries are batched and flushed every 500 ms or when 50+ are queued.
pub struct MorkLayer {
    sender: mpsc::UnboundedSender<String>,
}

impl MorkLayer {
    pub fn new(mork_url: String) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("log worker runtime");
            rt.block_on(mork_log_worker(mork_url, rx));
        });
        Self { sender: tx }
    }
}

impl<S: Subscriber> Layer<S> for MorkLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let level = meta.level().as_str();
        let target = meta.target();
        let ts = chrono::Local::now()
            .format("%Y-%m-%dT%H:%M:%S%.3f")
            .to_string();

        let mut visitor = EventVisitor::default();
        event.record(&mut visitor);

        // Build extra key=value pairs if present.
        let extras: String = visitor
            .extras
            .iter()
            .map(|(k, v)| format!(" ({} \"{}\")", escape_metta(k), escape_metta(v)))
            .collect();

        let atom = format!(
            "(log {} \"{}\" \"{}\" \"{}\"{})",
            level,
            escape_metta(target),
            escape_metta(&ts),
            escape_metta(&visitor.message),
            extras,
        );

        // A send failure means the worker exited — nothing we can do.
        let _ = self.sender.send(atom);
    }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

pub fn setup_logging() -> Option<WorkerGuard> {
    std::env::set_var("ROCKET_CLI_COLORS", "0");

    let is_prod = crate::config::config().env == "production";
    let file_appender = tracing_appender::rolling::daily("./logs", "production.log");

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "warn,api=info,rocket=error,diesel=warn".into());

    let mork_url = crate::config::config().mork_url.clone();
    let mork_layer = MorkLayer::new(mork_url);

    let registry = tracing_subscriber::registry()
        .with(filter)
        .with(mork_layer);

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
