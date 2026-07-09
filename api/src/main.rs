use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use diesel::RunQueryDsl;
use moka::future::Cache;
use mork_client::MorkClient;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::fs::FileServer;
use rocket::http::Method;
use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::{catch_all_options_routes, AllowedOrigins};
use tokio::sync::{broadcast, Mutex};
use tracing::{error, info, instrument, warn};

use crate::config::{config, Config};
use crate::lock::LockManager;
use crate::log::setup_logging;
use crate::operations::OperationStore;

mod auth;
mod commands;
mod config;
mod db;
mod error;
mod events;
mod lock;
mod log;
mod model;
mod operations;
mod routes;
mod schema;
mod translations;

pub struct Shutdown(pub broadcast::Sender<()>);

struct DevModeFairing;

#[rocket::async_trait]
impl Fairing for DevModeFairing {
    fn info(&self) -> Info {
        Info {
            name: "Dev Mode — clear MORK space and op_log on startup",
            kind: Kind::Liftoff,
        }
    }

    #[instrument(skip(self, rocket))]
    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        if config().env == "dev" {
            let pool = rocket.state::<db::DbPool>().expect("DbPool not managed");
            let mut conn = pool.get().expect("Failed to get DB connection from pool");
            match diesel::delete(schema::op_log::table).execute(&mut conn) {
                Ok(n) => info!(rows_deleted = n, "Cleared op_log table"),
                Err(e) => warn!(error = %e, "Failed to clear op_log on startup"),
            }

            let mork_url = &config().mork_url;
            let client = MorkClient::new(mork_url.clone());

            if let Err(e) = client.clear(&PathBuf::from("/"), "$").await {
                error!(url = %mork_url, error = ?e, "MORK cleanup failed: Application crashing");
                std::io::stdout().flush().unwrap();
                std::io::stderr().flush().unwrap();
                std::process::exit(1);
            }
        }
    }
}

struct ShutdownFairing;

#[rocket::async_trait]
impl Fairing for ShutdownFairing {
    fn info(&self) -> Info {
        Info {
            name: "Exit clean-up",
            kind: Kind::Shutdown,
        }
    }

    #[instrument(skip(self, _rocket))]
    async fn on_shutdown(&self, _rocket: &Rocket<rocket::Orbit>) {
        info!(target: "server_lifecycle", "MeTTa-KG cleanup complete. Goodbye.");
    }
}

#[launch]
#[instrument]

fn rocket() -> Rocket<Build> {
    let config = Config::load();

    // Apply the configurable upload size limit to all Rocket data guards
    // (String, bytes, TempFile, json, etc.) so one env var controls everything.
    let max = config.max_upload_bytes;
    let figment = rocket::Config::figment()
        .merge(("limits.string",    max))
        .merge(("limits.bytes",     max))
        .merge(("limits.file",      max))
        .merge(("limits.json",      max))
        .merge(("limits.msgpack",   max))
        .merge(("limits.data-form", max));

    mork_client::MorkLogger::init("logs");

    let _log_guard = setup_logging();

    let pool = db::init_pool();
    db::run_migrations(&pool);

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let origins_list: Vec<&str> = config.allowed_origins.split(',').collect();

    let allowed_origins = AllowedOrigins::some_exact(&origins_list);

    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![
            Method::Get,
            Method::Post,
            Method::Put,
            Method::Delete,
            Method::Options,
        ]
        .into_iter()
        .map(From::from)
        .collect(),
        send_wildcard: true,
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()
    .unwrap();

    let lock_manager = LockManager {
        cache: Cache::builder()
            .max_capacity(10_000)
            .time_to_idle(Duration::from_secs(600))
            .build(),
        op_mutex: Mutex::new(()),
    };

    rocket::custom(figment)
        .manage(events::EventBus::new())
        .manage(events::PresenceStore::new())
        .manage(Shutdown(shutdown_tx))
        .manage(lock_manager)
        .manage(OperationStore::new())
        .manage(cors.clone())
        .manage(config.clone())
        .manage(pool)
        .mount(
            "/",
            routes![
                routes::op_logs::get_log,
                routes::op_logs::get_logs,
                routes::op_logs::get_logs_graph,
                routes::op_logs::rollback_log,
                routes::op_logs::redo_log,
                routes::op_logs::create_checkpoint,
                routes::op_logs::my_last_undoable,
                routes::op_logs::my_last_redoable,
                routes::tokens::get_all,
                routes::tokens::get,
                routes::tokens::create,
                routes::tokens::update,
                routes::tokens::delete,
                routes::tokens::delete_batch,
                routes::spaces::import,
                routes::spaces::import_csv,
                routes::spaces::import_nt,
                routes::spaces::import_jsonld,
                routes::spaces::import_n3,
                routes::spaces::transform,
                routes::spaces::clear,
                routes::spaces::status,
                routes::spaces::explore,
                routes::spaces::explore_namespaces,
                routes::spaces::count,
                routes::spaces::import_url_metta,
                routes::spaces::import_url_csv,
                routes::spaces::import_url_nt,
                routes::spaces::import_url_jsonld,
                routes::spaces::import_url_n3,
                routes::spaces::copy,
                routes::spaces::subtract,
                routes::spaces::export_space,
                routes::spaces::init_space,
                routes::server_logs::server_logs,
                routes::spaces::editor_diff,
                routes::spaces::editor_commit,
                routes::operations::get_operation,
                routes::events::ws_ping,
                routes::events::ws_events,
                routes::events::ws_editor,
                routes::events::ws_status,
                routes::events::ws_watch,
                routes::health::health,
            ],
        )
        .mount("/", catch_all_options_routes())
        .mount("/public", FileServer::from("static"))
        .attach(cors)
        .attach(DevModeFairing)
        .attach(ShutdownFairing)
}
