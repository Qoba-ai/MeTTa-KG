use rocket::{self, launch, routes, Build, Rocket};
use rocket_cors::{AllowedHeaders, AllowedOrigins};

mod db;
mod model;
mod routes;
mod schema;

#[launch]
fn rocket() -> Rocket<Build> {
    let allowed_origins = AllowedOrigins::some_exact(&["http://localhost:3000"]);

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
                routes::namespaces::get_all,
                routes::namespaces::create,
                routes::sessions::create,
                routes::translations::create
            ],
        )
        .attach(cors)
}
