use rocket::fs::FileServer;
use rocket::http::Method;
use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::AllowedOrigins;

mod db;
mod events;
mod model;
mod routes;
mod schema;

#[launch]
fn rocket() -> Rocket<Build> {
    // TODO: move hardcoded allowed origins to database,
    // or get backend and frontend hosted under same domain
    let allowed_origins =
        AllowedOrigins::some_exact(&["http://localhost:3000", "https://metta-kg.vercel.app"]);

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
        .mount(
            "/",
            routes![
                routes::translations::create_from_csv,
                routes::translations::create_from_nt,
                routes::translations::create_from_jsonld,
                routes::translations::create_from_n3,
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
                routes::spaces::busywait,
                routes::spaces::clear,
                routes::spaces::clear_root,
                routes::spaces::status,
                routes::spaces::status_root,
                routes::spaces::explore,
                routes::spaces::explore_root,
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
            ],
        )
        .mount("/public", FileServer::from("static"))
        .attach(cors)
}
