use api::rocket;
use rocket::{launch, Build, Rocket};

#[launch]
fn rocket_main() -> Rocket<Build> {
    rocket()
}
