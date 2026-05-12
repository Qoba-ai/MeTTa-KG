use std::path::{Component, Path};

pub mod events;
pub mod health;
pub mod op_logs;
pub mod server_logs;
pub mod spaces;
pub mod tokens;

pub fn path_to_metta_sexpr(path: &Path) -> String {
    let mut sexpr = String::from("$");

    for component in path.components().rev() {
        if let Component::Normal(name) = component {
            let name_str = name.to_string_lossy();
            sexpr = format!("({} {})", name_str, sexpr);
        }
    }

    sexpr
}
