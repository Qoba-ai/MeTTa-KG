use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SpaceEvent {
    Locked {
        path: String,
    },
    Unlocked {
        path: String,
    },
    ImportComplete {
        path: String,
    },
    ImportError {
        path: String,
        message: String,
    },
    ClearComplete {
        path: String,
    },
    ClearError {
        path: String,
        message: String,
    },
    TransformComplete {
        path: String,
    },
    TransformError {
        path: String,
        message: String,
    },
    OpLogChanged {
        token_id: i32,
        entries: Vec<crate::model::OpLogEntry>,
    },
    EditorDiff {
        path: String,
        ts: i64,
        trie: serde_json::Value,
    },
    EditorPresence {
        path: String,
        session_id: String,
        display_name: String,
        joined: bool,
    },
    EditorCursor {
        path: String,
        session_id: String,
        display_name: String,
        line: i32,
        col: i32,
    },
}

impl SpaceEvent {
    pub fn path(&self) -> &str {
        match self {
            Self::Locked { path }
            | Self::Unlocked { path }
            | Self::ImportComplete { path }
            | Self::ImportError { path, .. }
            | Self::ClearComplete { path }
            | Self::ClearError { path, .. }
            | Self::TransformComplete { path }
            | Self::TransformError { path, .. }
            | Self::EditorDiff { path, .. }
            | Self::EditorPresence { path, .. }
            | Self::EditorCursor { path, .. } => path,
            Self::OpLogChanged { .. } => "",
        }
    }
}

pub struct EventBus(pub broadcast::Sender<SpaceEvent>);

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        EventBus(tx)
    }
}

/// A single connected editor session.
#[derive(Clone, Debug)]
pub struct PresenceEntry {
    pub path: String,
    pub session_id: String,
    pub display_name: String,
}

/// Global registry of currently-open editor presence WebSocket connections.
/// Keyed by session_id.  Uses a std Mutex (never held across awaits).
pub struct PresenceStore(pub Arc<Mutex<HashMap<String, PresenceEntry>>>);

impl PresenceStore {
    pub fn new() -> Self {
        PresenceStore(Arc::new(Mutex::new(HashMap::new())))
    }

    pub fn snapshot(&self) -> Vec<PresenceEntry> {
        self.0.lock().unwrap().values().cloned().collect()
    }
}
