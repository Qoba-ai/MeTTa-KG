use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::AllowedOrigins;

mod db;
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
        ..Default::default()
    }
    .to_cors()
    .unwrap();

    rocket::build()
        .mount(
            "/",
            routes![
                routes::translations::create_from_csv,
                routes::tokens::get_all,
                routes::tokens::create,
                routes::tokens::update,
                routes::tokens::delete,
                routes::tokens::delete_batch
            ],
        )
        .attach(cors)
}
