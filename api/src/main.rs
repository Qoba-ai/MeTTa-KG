use rocket::fs::FileServer;
use rocket::http::Method;
use rocket::{self, launch, routes, tokio, Build, Rocket};
use rocket_cors::AllowedOrigins;

mod db;
mod model;
mod mork_api;
mod routes;
mod schema;

#[launch]
fn rocket() -> Rocket<Build> {
    // TODO: move hardcoded allowed origins to database,
    // or get backend and frontend hosted under same domain

    dotenv::dotenv().ok();

    let allowed_origins =
        AllowedOrigins::some_exact(&["http://localhost:3000", "https://metta-kg.vercel.app"]);

    let cors = rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
        ..Default::default()
    }
    .to_cors()
    .unwrap();

    rocket::build()
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
                routes::spaces::read,
                routes::spaces::upload,
                routes::spaces::import,
                routes::spaces::transform,
                routes::spaces::explore,
                routes::spaces::export,
                routes::spaces::clear,
            ],
        )
        // .mount("/public", FileServer::from("static"))
        .attach(cors.clone())
        .manage(cors)
}