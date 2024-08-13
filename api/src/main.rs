use rocket::{self, launch, routes, Build, Rocket};

mod db;
mod model;
mod routes;
mod schema;

#[launch]
fn rocket() -> Rocket<Build> {
    rocket::build().mount(
        "/",
        routes![routes::namespaces::get_all, routes::namespaces::create],
    )
}

