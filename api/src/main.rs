use std::collections::HashMap;
use std::env;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
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

use crate::config::Config;
use crate::lock::LockManager;
use crate::log::setup_logging;
use crate::sync::Docs;

mod commands;
mod config;
mod db;
mod events;
mod lock;
mod log;
mod model;
mod routes;
mod schema;
mod sync;

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

    #[instrument(skip(self, _rocket))]
    async fn on_liftoff(&self, _rocket: &Rocket<rocket::Orbit>) {
        if std::env::var("METTA_KG_ENV").unwrap_or_default() == "dev" {
            let conn = &mut db::establish_connection();
            match diesel::delete(schema::op_log::table).execute(conn) {
                Ok(n) => info!(rows_deleted = n, "Cleared op_log table"),
                Err(e) => warn!(error = %e, "Failed to clear op_log on startup"),
            }

            let mork_url = env::var("METTA_KG_MORK_URL").unwrap_or_default();
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
    let config = Config::new()
        .map_err(|e| {
            error!(error = ?e, "MORK startup failed: Missing environment variable(s)");
        })
        .unwrap();

    mork_client::MorkLogger::init("logs");

    let _log_guard = setup_logging();

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let origins_str =
        std::env::var("ALLOWED_ORIGINS").unwrap_or_else(|_| "http://localhost:3000".into());
    let origins_list: Vec<&str> = origins_str.split(',').collect();

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

    let docs: Docs = Arc::new(Mutex::new(HashMap::new()));

    rocket::build()
        .manage(events::EventBus::new())
        .manage(events::PresenceStore::new())
        .manage(Shutdown(shutdown_tx))
        .manage(lock_manager)
        .manage(cors.clone())
        .manage(config.clone())
        .manage(docs)
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
                routes::spaces::import_root,
                routes::spaces::import_csv,
                routes::spaces::import_nt,
                routes::spaces::import_jsonld,
                routes::spaces::import_n3,
                routes::spaces::transform,
                routes::spaces::clear,
                routes::spaces::clear_root,
                routes::spaces::status,
                routes::spaces::status_root,
                routes::spaces::explore,
                routes::spaces::explore_root,
                routes::spaces::explore_namespaces,
                routes::spaces::count,
                routes::spaces::count_root,
                routes::spaces::import_url_metta,
                routes::spaces::import_url_csv,
                routes::spaces::import_url_nt,
                routes::spaces::import_url_jsonld,
                routes::spaces::import_url_n3,
                routes::spaces::copy,
                routes::spaces::subtract,
                routes::spaces::editor_diff_root,
                routes::spaces::editor_diff,
                routes::spaces::editor_commit_root,
                routes::spaces::editor_commit,
                routes::spaces::editor_presence_root,
                routes::spaces::editor_presence,
                routes::spaces::editor_cursor_root,
                routes::spaces::editor_cursor,
                routes::events::ws_ping,
                routes::events::ws_events,
                routes::events::ws_editor_root,
                routes::events::ws_editor,
                routes::events::ws_status_root,
                routes::events::ws_status,
                routes::health::health,
            ],
        )
        .mount("/", catch_all_options_routes())
        .mount("/public", FileServer::from("static"))
        .attach(cors)
        .attach(DevModeFairing)
        .attach(ShutdownFairing)
}
