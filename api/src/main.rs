use std::env;
use std::path::PathBuf;
use std::time::Duration;

use diesel::RunQueryDsl;
use moka::future::Cache;
use mork_client::MorkClient;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::fs::FileServer;
use rocket::http::Method;
use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::AllowedOrigins;
use tokio::sync::{broadcast, Mutex};

use crate::lock::LockManager;

mod commands;
mod db;
mod events;
mod lock;
mod model;
mod routes;
mod schema;

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

    async fn on_liftoff(&self, _rocket: &Rocket<rocket::Orbit>) {
        if std::env::var("METTA_KG_DEV").is_ok() {
            let conn = &mut db::establish_connection();
            match diesel::delete(schema::op_log::table).execute(conn) {
                Ok(n) => log::info!("[dev] cleared {n} op_log row(s) on startup"),
                Err(e) => log::warn!("[dev] failed to clear op_log on startup: {e}"),
            }

            let client = MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap());

            if let Err(e) = client.clear(&PathBuf::from("/"), "$").await {
                log::error!("Application failed to start: {:?}", e);
                std::process::exit(1);
            }
        }
    }
}

// ─── Shutdown fairing ────────────────────────────────────────────────────────

struct ShutdownFairing;

#[rocket::async_trait]
impl Fairing for ShutdownFairing {
    fn info(&self) -> Info {
        Info {
            name: "Shutdown Signal Handler",
            kind: Kind::Liftoff,
        }
    }

    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        let shutdown_tx = rocket.state::<Shutdown>().unwrap().0.clone();
        tokio::spawn(async move {
            let _ = tokio::signal::ctrl_c().await;
            let _ = shutdown_tx.send(());
        });
    }
}

#[launch]
fn rocket() -> Rocket<Build> {
    mork_client::MorkLogger::init("logs");

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    let allowed_origins = AllowedOrigins::some_regex(&[
        r"^http://localhost:(3\d{3}|4000)$",
        r"^https://metta-kg\.vercel\.app$",
    ]);

    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Put, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
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

    rocket::build()
        .manage(events::EventBus::new())
        .manage(Shutdown(shutdown_tx))
        .manage(lock_manager)
        .mount(
            "/",
            routes![
                routes::translations::create_from_csv,
                routes::translations::create_from_nt,
                routes::translations::create_from_jsonld,
                routes::translations::create_from_n3,
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
                routes::spaces::subtract,
                routes::events::ws_ping,
                routes::events::ws_events,
                routes::events::ws_status_root,
                routes::events::ws_status
            ],
        )
        .mount("/public", FileServer::from("static"))
        .attach(cors)
        .attach(DevModeFairing)
        .attach(ShutdownFairing)
}
