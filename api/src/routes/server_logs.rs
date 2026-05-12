use std::path::{Path, PathBuf};

use mork_client::{ExploreResult, MorkClient};
use rocket::serde::json::Json;
use rocket::{get, State};

use crate::config::Config;
use crate::error::ApiError;
use crate::model::Token;
use crate::routes::spaces::require_root;

/// `pattern` is a MeTTa sub-expression substituted into `(logs <pattern>)`.
/// Defaults to `$` (all logs). Examples:
///   - `$`              → `(logs $)`            — all log atoms
///   - `(log ERROR $)`  → `(logs (log ERROR $))` — error logs only
#[get("/server-logs?<focus_token>&<page_size>&<pattern>")]
pub async fn server_logs(
    token: Token,
    config: &State<Config>,
    focus_token: Option<String>,
    page_size: Option<usize>,
    pattern: Option<String>,
) -> Result<Json<ExploreResult>, ApiError> {
    require_root(&token)?;

    let page_size = page_size.unwrap_or(100).clamp(1, 10000);
    let focus_token = focus_token.unwrap_or_default();
    let user_pattern = pattern.as_deref().unwrap_or("$");
    let mork_pattern = format!("(logs {})", user_pattern);

    let client = MorkClient::new(config.mork_url.clone());

    let result = client
        .explore_pattern(&mork_pattern, Path::new("logs"), &PathBuf::from(""), &focus_token, page_size)
        .await?;

    Ok(Json(result))
}
