use crate::db::establish_connection;
use crate::events::{EventBus, PresenceEntry, PresenceStore, SpaceEvent};
use crate::routes::path_to_metta_sexpr;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, SelectableHelper};
use futures::{SinkExt, StreamExt};
use rocket::http::Status;
use rocket::State;
use rocket_ws as ws;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};

fn validate_token_code(token_code: &str) -> Option<crate::model::Token> {
    use crate::schema::tokens::dsl::*;
    let conn = &mut establish_connection();
    tokens
        .select(crate::model::Token::as_select())
        .filter(code.eq(token_code))
        .get_result(conn)
        .ok()
}

fn event_in_namespace(event: &SpaceEvent, namespace: &str) -> bool {
    let path = event.path();

    if !path.starts_with("/")
        || !path.ends_with("/")
        || !namespace.starts_with("/")
        || !namespace.ends_with("/")
    {
        error!(path = %path, namespace = %namespace, "Namespace not enclosed in '/'-characters");
        return false;
    }

    event.path().starts_with(namespace)
}

fn presence_paths_related(event_path: &str, namespace: &str) -> bool {
    if namespace == "/" || namespace.is_empty() {
        return true;
    }
    event_path.starts_with(namespace) || namespace.starts_with(event_path)
}

#[rocket::get("/ws/ping")]
pub fn ws_ping(ws: ws::WebSocket, shutdown: &State<crate::Shutdown>) -> ws::Channel<'static> {
    use rocket::tokio::time::{interval, Duration};

    let mut shutdown_rx = shutdown.inner().0.subscribe();

    ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();
            let mut ticker = interval(Duration::from_secs(5));
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

#[rocket::get("/ws/events?<token_code>")]
pub fn ws_events(
    ws: ws::WebSocket,
    token_code: String,
    bus: &State<EventBus>,
    presence: &State<PresenceStore>,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or_else(|| {
        warn!("WebSocket events connection rejected: invalid token");
        Status::Unauthorized
    })?;

    if !token.permission_read {
        warn!(
            token_id = token.id,
            "WebSocket events connection rejected: no read permission"
        );
        return Err(Status::Unauthorized);
    }

    info!(token_id = token.id, namespace = %token.namespace, "WebSocket events client connected");

    let mut rx: broadcast::Receiver<SpaceEvent> = bus.inner().0.subscribe();
    let namespace = token.namespace.clone();
    let mut shutdown_rx = shutdown.inner().0.subscribe();

    // Snapshot current presence to send as initial state.
    let initial_presence = presence.snapshot();

    let token_id = token.id;
    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();

            // Replay all currently-connected sessions so the new client has
            // the full presence state without waiting for the next update.
            for entry in &initial_presence {
                if !presence_paths_related(&entry.path, &namespace) {
                    continue;
                }
                let event = SpaceEvent::EditorPresence {
                    path: entry.path.clone(),
                    session_id: entry.session_id.clone(),
                    display_name: entry.display_name.clone(),
                    joined: true,
                };
                let json = serde_json::to_string(&event).unwrap_or_default();
                if sink.send(ws::Message::Text(json)).await.is_err() {
                    return Ok(());
                }
            }

            loop {
                tokio::select! {
                    event_result = rx.recv() => {
                        match event_result {
                            Ok(event) => {
                                let forward = match &event {
                                    crate::events::SpaceEvent::OpLogChanged { token_id: tid, .. } => {
                                        *tid == token_id
                                    }
                                    // EditorDiff is now handled exclusively via ws_watch subscriptions
                                    crate::events::SpaceEvent::EditorDiff { .. } => false,
                                    crate::events::SpaceEvent::EditorPresence { path, .. }
                                    | crate::events::SpaceEvent::EditorCursor { path, .. } => {
                                        presence_paths_related(path, &namespace)
                                    }
                                    other => event_in_namespace(other, &namespace),
                                };
                                if forward {
                                    let json = serde_json::to_string(&event)
                                        .unwrap_or_default();
                                    if sink.send(ws::Message::Text(json)).await.is_err() {
                                        debug!(token_id, "WebSocket events client disconnected");
                                        break;
                                    }
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                warn!(token_id, skipped = n, "WebSocket events client lagged; events dropped");
                                continue;
                            }
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Close(_))) | None => {
                                debug!(token_id, "WebSocket events client closed connection");
                                break;
                            }
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
// Editor presence WebSocket — kept alive while a client has a panel open;
// server emits EditorPresence{joined:true} on connect and joined:false on any
// disconnect (including tab/window close).
// ---------------------------------------------------------------------------

#[rocket::get("/ws/editor/<path..>?<token_code>&<session_id>&<display_name>")]
pub async fn ws_editor(
    ws: ws::WebSocket,
    path: PathBuf,
    token_code: String,
    session_id: String,
    display_name: String,
    bus: &State<EventBus>,
    presence: &State<PresenceStore>,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or_else(|| {
        warn!("WebSocket editor presence connection rejected: invalid token");
        Status::Unauthorized
    })?;
    if !token.permission_read {
        warn!(
            token_id = token.id,
            "WebSocket editor presence connection rejected: no read permission"
        );
        return Err(Status::Unauthorized);
    }

    let token_ns = token
        .namespace
        .strip_prefix('/')
        .unwrap_or(&token.namespace)
        .to_string();
    if !token_ns.is_empty() && !path.starts_with(&token_ns) {
        warn!(
            token_id = token.id,
            path = %path.display(),
            "WebSocket editor presence connection rejected: path outside namespace"
        );
        return Err(Status::Unauthorized);
    }

    let event_path = if path.as_os_str().is_empty() {
        "/".to_string()
    } else {
        format!("/{}/", path.to_string_lossy())
    };

    let bus_tx = bus.inner().0.clone();
    let presence_arc = presence.inner().0.clone();
    let mut shutdown_rx = shutdown.inner().0.subscribe();

    info!(
        session_id = %session_id,
        path = %event_path,
        "Editor presence WebSocket connected"
    );

    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();

            presence_arc.lock().unwrap().insert(session_id.clone(), PresenceEntry {
                path: event_path.clone(),
                session_id: session_id.clone(),
                display_name: display_name.clone(),
            });
            let _ = bus_tx.send(SpaceEvent::EditorPresence {
                path: event_path.clone(),
                session_id: session_id.clone(),
                display_name: display_name.clone(),
                joined: true,
            });

            loop {
                tokio::select! {
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Text(text))) => {
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                    if let (Some(line), Some(col)) = (
                                        v["line"].as_i64(),
                                        v["col"].as_i64(),
                                    ) {
                                        let _ = bus_tx.send(SpaceEvent::EditorCursor {
                                            path: event_path.clone(),
                                            session_id: session_id.clone(),
                                            display_name: display_name.clone(),
                                            line: line as i32,
                                            col: col as i32,
                                        });
                                    }
                                }
                            }
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

            presence_arc.lock().unwrap().remove(&session_id);
            let _ = bus_tx.send(SpaceEvent::EditorPresence {
                path: event_path.clone(),
                session_id: session_id.clone(),
                display_name: display_name.clone(),
                joined: false,
            });

            debug!(session_id = %session_id, path = %event_path, "Editor presence WebSocket disconnected");
            Ok(())
        })
    }))
}

// ---------------------------------------------------------------------------
// Expression-watch WebSocket — clients subscribe to specific MeTTa expressions
// and receive notifications when those expressions are edited.
//
// Client → Server messages (JSON):
//   {"type":"subscribe",   "namespace":"/path/", "expr":"(ab c)"}
//   {"type":"unsubscribe", "namespace":"/path/", "expr":"(ab c)"}
//
// Server → Client messages (JSON):
//   {"type":"subscribed",   "namespace":"/path/", "expr":"(ab c)"}
//   {"type":"unsubscribed", "namespace":"/path/", "expr":"(ab c)"}
//   {"type":"exprChanged",  "namespace":"/path/", "old":"(ab c)", "added":["(ab d)"]}
//     — the server automatically removes the old subscription and subscribes
//       to every expression in the `added` list.
// ---------------------------------------------------------------------------

#[rocket::get("/ws/watch?<token_code>")]
pub async fn ws_watch(
    ws: ws::WebSocket,
    token_code: String,
    bus: &State<EventBus>,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or_else(|| {
        warn!("WebSocket watch connection rejected: invalid token");
        Status::Unauthorized
    })?;

    if !token.permission_read {
        warn!(
            token_id = token.id,
            "WebSocket watch connection rejected: no read permission"
        );
        return Err(Status::Unauthorized);
    }

    let token_namespace = token.namespace.clone();
    let token_id = token.id;
    let mut rx = bus.inner().0.subscribe();
    let mut shutdown_rx = shutdown.inner().0.subscribe();

    info!(token_id, namespace = %token_namespace, "WebSocket watch client connected");

    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();
            // namespace → set of watched expressions
            let mut subscriptions: HashMap<String, HashSet<String>> = HashMap::new();

            loop {
                tokio::select! {
                    event_result = rx.recv() => {
                        match event_result {
                            Ok(SpaceEvent::EditorDiff { path, trie, .. }) => {
                                if let Some(watched) = subscriptions.get_mut(&path) {
                                    let mut added: Vec<String> = Vec::new();
                                    let mut removed: Vec<String> = Vec::new();
                                    crate::routes::spaces::collect_diff_atoms(
                                        &trie, &mut Vec::new(), &mut added, &mut removed,
                                    );
                                    added.retain(|a| mork_client::is_balanced(a));

                                    // Collect matching expressions before mutating `watched`
                                    let hits: Vec<String> = removed
                                        .iter()
                                        .filter(|e| watched.contains(*e))
                                        .cloned()
                                        .collect();

                                    for old_expr in hits {
                                        watched.remove(&old_expr);
                                        for new_expr in &added {
                                            watched.insert(new_expr.clone());
                                        }
                                        let msg = serde_json::json!({
                                            "type": "exprChanged",
                                            "namespace": path,
                                            "old": old_expr,
                                            "added": added,
                                        });
                                        if sink.send(ws::Message::Text(msg.to_string())).await.is_err() {
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                warn!(token_id, skipped = n, "WebSocket watch client lagged; events dropped");
                                continue;
                            }
                            Err(broadcast::error::RecvError::Closed) => break,
                            Ok(_) => {}
                        }
                    }
                    msg = source.next() => {
                        match msg {
                            Some(Ok(ws::Message::Text(text))) => {
                                let v = match serde_json::from_str::<serde_json::Value>(&text) {
                                    Ok(v) => v,
                                    Err(_) => continue,
                                };
                                let msg_type  = v["type"].as_str().unwrap_or("").to_string();
                                let namespace = v["namespace"].as_str().unwrap_or("").to_string();
                                let expr      = v["expr"].as_str().unwrap_or("").to_string();

                                if namespace.is_empty() || expr.is_empty() {
                                    continue;
                                }

                                // Reject subscriptions outside the token's allowed namespace
                                let allowed = token_namespace == "/"
                                    || namespace.starts_with(&token_namespace);
                                if !allowed {
                                    warn!(
                                        token_id,
                                        namespace = %namespace,
                                        "Watch subscription rejected: outside token namespace"
                                    );
                                    continue;
                                }

                                match msg_type.as_str() {
                                    "subscribe" => {
                                        subscriptions
                                            .entry(namespace.clone())
                                            .or_default()
                                            .insert(expr.clone());
                                        let ack = serde_json::json!({
                                            "type": "subscribed",
                                            "namespace": namespace,
                                            "expr": expr,
                                        });
                                        let _ = sink.send(ws::Message::Text(ack.to_string())).await;
                                    }
                                    "unsubscribe" => {
                                        if let Some(set) = subscriptions.get_mut(&namespace) {
                                            set.remove(&expr);
                                            if set.is_empty() {
                                                subscriptions.remove(&namespace);
                                            }
                                        }
                                        let ack = serde_json::json!({
                                            "type": "unsubscribed",
                                            "namespace": namespace,
                                            "expr": expr,
                                        });
                                        let _ = sink.send(ws::Message::Text(ack.to_string())).await;
                                    }
                                    _ => {}
                                }
                            }
                            Some(Ok(ws::Message::Close(_))) | None => {
                                debug!(token_id, "WebSocket watch client closed connection");
                                break;
                            }
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

            debug!(token_id, "WebSocket watch client disconnected");
            Ok(())
        })
    }))
}

// ---------------------------------------------------------------------------
// Status-stream WebSocket — proxies MORK SSE to the client
// ---------------------------------------------------------------------------

#[rocket::get("/ws/status/<path..>?<token_code>")]
pub async fn ws_status(
    ws: ws::WebSocket,
    path: PathBuf,
    token_code: String,
    shutdown: &State<crate::Shutdown>,
) -> Result<ws::Channel<'static>, Status> {
    let token = validate_token_code(&token_code).ok_or_else(|| {
        warn!("WebSocket status connection rejected: invalid token");
        Status::Unauthorized
    })?;
    if !token.permission_read {
        warn!(
            token_id = token.id,
            "WebSocket status connection rejected: no read permission"
        );
        return Err(Status::Unauthorized);
    }

    let token_ns = token
        .namespace
        .strip_prefix('/')
        .unwrap_or(&token.namespace)
        .to_string();
    if !token_ns.is_empty() && !path.starts_with(&token_ns) {
        warn!(token_id = token.id, path = %path.display(), "WebSocket status connection rejected: path outside namespace");
        return Err(Status::Unauthorized);
    }

    info!(token_id = token.id, path = %path.display(), "WebSocket status client connected");

    let expr = path_to_metta_sexpr(&path);
    let encoded = urlencoding::encode(&expr).into_owned();

    let mork_base = crate::config::config().mork_url.clone();
    let mork_base = mork_base.trim_end_matches('/').to_string();
    let status_url = format!("{}/status/{}", mork_base, encoded);
    let stream_url = format!("{}/status_stream/{}", mork_base, encoded);

    let mut shutdown_rx = shutdown.inner().0.subscribe();

    Ok(ws.channel(move |stream| {
        Box::pin(async move {
            let (mut sink, mut source) = stream.split();
            let client = reqwest::Client::new();

            if let Ok(resp) = client.get(&status_url).send().await {
                if let Ok(text) = resp.text().await {
                    let _ = sink.send(ws::Message::Text(text)).await;
                }
            }

            let sse_resp = match client.get(&stream_url).send().await {
                Ok(r)  => r,
                Err(e) => {
                    error!(url = %stream_url, error = %e, "Failed to connect to MORK SSE stream");
                    return Ok(());
                }
            };
            let mut sse_stream = sse_resp.bytes_stream();
            let mut buf = String::new();

            loop {
                tokio::select! {
                    chunk = sse_stream.next() => {
                        match chunk {
                            Some(Ok(bytes)) => {
                                buf.push_str(&String::from_utf8_lossy(&bytes));
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
