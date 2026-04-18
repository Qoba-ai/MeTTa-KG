use crate::db::establish_connection;
use crate::events::{EventBus, SpaceEvent};
use crate::routes::path_to_metta_sexpr;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use futures::{SinkExt, StreamExt};
use rocket::http::Status;
use rocket::State;
use rocket_ws as ws;
use std::path::PathBuf;
use tokio::sync::broadcast;

fn validate_token_code(token_code: &str) -> Option<crate::model::Token> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();
    tokens
        .select(crate::model::Token::as_select())
        .filter(code.eq(token_code))
        .get_result(conn)
        .ok()
}

/// Returns true if the event path falls within the subscriber's namespace.
/// Namespace is like "/" (root) or "/foo/bar/".
/// Event path is like "/" or "/foo/bar/baz/".
fn event_in_namespace(event: &SpaceEvent, namespace: &str) -> bool {
    // Root namespace receives all events
    if namespace == "/" || namespace.is_empty() {
        return true;
    }
    event.path().starts_with(namespace)
}

/// Global health/ping WebSocket — no token required.
/// Sends `{"type":"ping"}` every 5 seconds.
#[rocket::get("/ws/ping")]
pub fn ws_ping(ws: ws::WebSocket, shutdown: &State<crate::Shutdown>) -> ws::Channel<'static> {
    use rocket::tokio::time::{interval, Duration};

    let mut shutdown_rx = shutdown.inner().0.subscribe();

    ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();
            let mut ticker = interval(Duration::from_secs(5));
            // Send an immediate ping so the client knows it's connected
            let _ = sink
                .send(ws::Message::Text(
                    serde_json::json!({"type": "ping"}).to_string(),
                ))
                .await;

            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        let msg = serde_json::json!({"type": "ping"}).to_string();
                        if sink.send(ws::Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Close(_))) | None => break,
                            Some(Err(_)) => break,
                            _ => {}
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        let _ = sink.send(ws::Message::Close(None)).await;
                        break;
                    }
                }
            }
            Ok(())
        })
    })
}

/// Authenticated space-event WebSocket.
/// Connect with `?token_code=<your-token>`.
/// Emits JSON events for spaces within the token's namespace.
#[rocket::get("/ws/events?<token_code>")]
pub fn ws_events(
    ws: ws::WebSocket,
    token_code: String,
    bus: &State<EventBus>,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or(Status::Unauthorized)?;

    if !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mut rx: broadcast::Receiver<SpaceEvent> = bus.inner().0.subscribe();
    let namespace = token.namespace.clone();
    let mut shutdown_rx = shutdown.inner().0.subscribe();

    let token_id = token.id;
    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();

            loop {
                tokio::select! {
                    event_result = rx.recv() => {
                        match event_result {
                            Ok(event) => {
                                let forward = match &event {
                                    crate::events::SpaceEvent::OpLogChanged { token_id: tid, .. } => {
                                        *tid == token_id
                                    }
                                    other => event_in_namespace(other, &namespace),
                                };
                                if forward {
                                    let json = serde_json::to_string(&event)
                                        .unwrap_or_default();
                                    if sink.send(ws::Message::Text(json)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Close(_))) | None => break,
                            Some(Err(_)) => break,
                            _ => {}
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        let _ = sink.send(ws::Message::Close(None)).await;
                        break;
                    }
                }
            }
            Ok(())
        })
    }))
}

// ---------------------------------------------------------------------------
// Status-stream WebSocket — proxies MORK SSE to the client
// ---------------------------------------------------------------------------

async fn ws_status_inner(
    ws: ws::WebSocket,
    path: PathBuf,
    token_code: String,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or(Status::Unauthorized)?;
    if !token.permission_read {
        return Err(Status::Unauthorized);
    }

    // Check the requested path is within the token's namespace
    let token_ns = token
        .namespace
        .strip_prefix('/')
        .unwrap_or(&token.namespace)
        .to_string();
    if !token_ns.is_empty() && !path.starts_with(&token_ns) {
        return Err(Status::Unauthorized);
    }

    let expr = path_to_metta_sexpr(&path);
    let encoded = urlencoding::encode(&expr).into_owned();

    let mork_base =
        std::env::var("METTA_KG_MORK_URL").unwrap_or_else(|_| "http://localhost:8001".to_string());
    let mork_base = mork_base.trim_end_matches('/').to_string();
    let status_url = format!("{}/status/{}", mork_base, encoded);
    let stream_url = format!("{}/status_stream/{}", mork_base, encoded);

    let mut shutdown_rx = shutdown.inner().0.subscribe();

    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();
            let client = reqwest::Client::new();

            // Send the current status immediately so the client has an initial value
            if let Ok(resp) = client.get(&status_url).send().await {
                if let Ok(text) = resp.text().await {
                    let _ = sink.send(ws::Message::Text(text)).await;
                }
            }

            // Connect to MORK SSE stream and forward events
            let sse_resp = match client.get(&stream_url).send().await {
                Ok(r)  => r,
                Err(_) => return Ok(()),
            };
            let mut sse_stream = sse_resp.bytes_stream();
            let mut buf = String::new();

            loop {
                tokio::select! {
                    chunk = sse_stream.next() => {
                        match chunk {
                            Some(Ok(bytes)) => {
                                buf.push_str(&String::from_utf8_lossy(&bytes));
                                // SSE events are delimited by a blank line (\n\n)
                                while let Some(pos) = buf.find("\n\n") {
                                    let event = buf[..pos].to_string();
                                    buf = buf[pos + 2..].to_string();
                                    for line in event.lines() {
                                        if let Some(data) = line.strip_prefix("data: ") {
                                            if sink.send(ws::Message::Text(data.to_string())).await.is_err() {
                                                return Ok(());
                                            }
                                        }
                                    }
                                }
                            }
                            _ => break,
                        }
                    }
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Close(_))) | None => break,
                            Some(Err(_)) => break,
                            _ => {}
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        let _ = sink.send(ws::Message::Close(None)).await;
                        break;
                    }
                }
            }
            Ok(())
        })
    }))
}

/// Status-stream WebSocket for the root namespace.
#[rocket::get("/ws/status?<token_code>")]
pub async fn ws_status_root(
    ws: ws::WebSocket,
    token_code: String,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    ws_status_inner(ws, PathBuf::new(), token_code, shutdown).await
}

/// Status-stream WebSocket for a specific namespace path.
#[rocket::get("/ws/status/<path..>?<token_code>")]
pub async fn ws_status(
    ws: ws::WebSocket,
    path: PathBuf,
    token_code: String,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    ws_status_inner(ws, path, token_code, shutdown).await
}
