use rocket::{post, Data, http::Status};
use rocket::response::status::Custom;
use rocket::tokio::io::AsyncReadExt;
use crate::model::Token;
use crate::mork_api::MorkApiClient;

#[post("/upload/<pattern>/<template>?<format>", data = "<data>")]
pub async fn upload(
    token: Token,
    pattern: &str,
    template: &str,
    format: Option<&str>,
    mut data: Data<'_>,
) -> Result<String, Custom<String>> {
    // Read the body as text
    let mut body = String::new();
    if let Err(e) = data.open(rocket::data::ByteUnit::Mebibyte(2)).read_to_string(&mut body).await {
        eprintln!("Failed to read body: {e}");
        return Err(Custom(Status::BadRequest, format!("Failed to read body: {e}")));
    }

    // Build the backend URL
    let backend_url = if let Some(fmt) = format {
        format!("/upload/{}/{}/?format={}", pattern, template, fmt)
    } else {
        format!("/upload/{}/{}/", pattern, template)
    };

    // Forward the request to the backend
    let client = MorkApiClient::new();
    let resp = client
        .post_upload(&backend_url, body)
        .await;

    match resp {
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_else(|_| "".to_string());
            if status.is_success() {
                Ok(text)
            } else {
                Err(Custom(Status::from_code(status.as_u16()).unwrap_or(Status::InternalServerError), text))
            }
        }
        Err(e) => Err(Custom(Status::InternalServerError, format!("Failed to contact backend: {e}"))),
    }
}