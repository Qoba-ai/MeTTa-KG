use rocket::fairing::{Fairing, Info, Kind};
use rocket::fs::FileServer;
use rocket::http::Method;
use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::AllowedOrigins;
use tokio::sync::broadcast;

mod db;
mod events;
mod model;
mod routes;
mod schema;

pub struct Shutdown(pub broadcast::Sender<()>);

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

    // TODO: move hardcoded allowed origins to database,
    // or get backend and frontend hosted under same domain
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

    rocket::build()
        .manage(events::EventBus::new())
        .manage(Shutdown(shutdown_tx))
        .mount(
            "/",
            routes![
                routes::translations::create_from_csv,
                routes::translations::create_from_nt,
                routes::translations::create_from_jsonld,
                routes::translations::create_from_n3,
                routes::op_logs::get_log,
                routes::op_logs::get_logs,
                routes::tokens::get_all,
                routes::tokens::get,
                routes::tokens::create,
                routes::tokens::update,
                routes::tokens::delete,
                routes::tokens::delete_batch,
                routes::spaces::export,
                routes::spaces::export_root,
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
                routes::spaces::copy,
                routes::spaces::import_url_metta,
                routes::spaces::import_url_csv,
                routes::spaces::import_url_nt,
                routes::spaces::import_url_jsonld,
                routes::spaces::import_url_n3,
                routes::events::ws_ping,
                routes::events::ws_events,
                routes::events::ws_status_root,
                routes::events::ws_status
            ],
        )
        .mount("/public", FileServer::from("static"))
        .attach(cors)
        .attach(ShutdownFairing)
}
