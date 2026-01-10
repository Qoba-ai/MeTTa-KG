use api::rocket;
use diesel_migrations::{embed_migrations, EmbeddedMigrations};
use rocket::{launch, Build, Rocket};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

#[launch]
fn rocket_main() -> Rocket<Build> {
    rocket()
}
