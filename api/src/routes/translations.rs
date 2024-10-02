use rocket::form::{FromForm, FromFormField};
use rocket::fs::TempFile;
use rocket::http::Status;
use rocket::post;
use rocket::serde::json::Json;
use std::fs;
use std::process::Command;
use uuid::Uuid;

// TODO: support formats other than csv

#[derive(FromFormField, Copy, Clone)]
pub enum ParseDirection {
    Row = 1,
    Column = 2,
    Cell = 3,
}

#[derive(FromForm)]
pub struct CSVParserParameters {
    pub direction: ParseDirection,
    pub delimiter: String,
}

#[post(
    "/translations?<parse_parameters..>",
    format = "text/csv",
    data = "<file>"
)]
pub async fn create_from_csv(
    mut file: TempFile<'_>,
    parse_parameters: CSVParserParameters,
) -> Result<Json<String>, Status> {
    let id = Uuid::new_v4();

    let path = format!("temp/translations-{}", id);

    let path_with_extension = format!("{}.csv", path);

    let result = file.persist_to(&path_with_extension).await;

    match result {
        Ok(_) => (),
        Err(err) => println!("{}", err),
    }

    let direction = parse_parameters.direction as u8;

    let output = Command::new("python3")
        .arg("translations/src/csv_to_metta_run.py")
        .arg(&path)
        .arg(direction.to_string())
        .arg(&parse_parameters.delimiter)
        .status();

    // TODO: better error handling
    match output {
        Ok(_) => (),
        Err(_) => {
            return Err(Status::InternalServerError);
        }
    };

    let contents = fs::read_to_string(format!("{}-output.metta", path));

    match contents {
        Ok(contents) => Ok(Json(contents)),
        Err(_) => Err(Status::InternalServerError),
    }
}
