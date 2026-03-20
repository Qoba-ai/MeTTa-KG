use reqwest::Client;
use serde::{Deserialize, Serialize};
use percent_encoding::{percent_encode, NON_ALPHANUMERIC};
use std::sync::Arc;
use async_stream::try_stream;
use futures_core::stream::Stream;
use std::pin::Pin;
use tokio_stream::StreamExt;
use std::collections::{VecDeque, HashSet};
use std::path::{Path, Component, PathBuf};

// ─── Explore (unchanged) ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExploreNodeData {
    pub expr: String,
    pub token: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct Explore {
    client: Arc<Client>,
    pub base_url: String,
    pub pattern: String,
    pub token: String,
    pub data: Option<Vec<ExploreNodeData>>,
}

impl Explore {
    pub fn new(client: Arc<Client>, base_url: String, pattern: String, token: String) -> Self {
        Self { client, base_url, pattern, token, data: None }
    }

    pub async fn dispatch(&mut self) -> Result<(), reqwest::Error> {
        let pattern_encoded = percent_encode(self.pattern.as_bytes(), NON_ALPHANUMERIC).to_string();
        let url = if self.token.is_empty() {
            format!("{}/explore/{}//", self.base_url, pattern_encoded)
        } else {
            format!("{}/explore/{}/{}/", self.base_url, pattern_encoded, self.token)
        };
        let res = self.client.get(&url).send().await?;
        if res.status().is_success() {
            let data: Vec<ExploreNodeData> = res.json().await?;
            self.data = Some(data);
        }
        Ok(())
    }

    pub fn values(&self) -> Vec<String> {
        self.data.as_ref().map_or(vec![], |d| d.iter().map(|item| item.expr.clone()).collect())
    }

    pub fn descend(&self, i: usize) -> Option<Self> {
        let data = self.data.as_ref()?;
        let item = data.get(i)?;
        let new_token = percent_encode(&item.token, NON_ALPHANUMERIC).to_string();
        Some(Self::new(self.client.clone(), self.base_url.clone(), self.pattern.clone(), new_token))
    }

    pub fn children(&self) -> Vec<Self> {
        let mut children = Vec::new();
        if let Some(data) = &self.data {
            for item in data {
                let new_token = percent_encode(&item.token, NON_ALPHANUMERIC).to_string();
                children.push(Self::new(self.client.clone(), self.base_url.clone(), self.pattern.clone(), new_token));
            }
        }
        children
    }

    pub fn levels(self) -> impl Stream<Item = Result<Vec<Explore>, reqwest::Error>> + Send {
        try_stream! {
            let mut frontier = vec![self];
            while !frontier.is_empty() {
                for c in &mut frontier { c.dispatch().await?; }
                yield frontier.clone();
                let mut new_frontier = Vec::new();
                for c in frontier { new_frontier.extend(c.children()); }
                frontier = new_frontier;
            }
        }
    }

    pub fn forward(self) -> impl Stream<Item = Result<String, reqwest::Error>> + Send {
        try_stream! {
            let children = self.children();
            let values = self.values();
            for (value, child) in values.into_iter().zip(children.into_iter()) {
                yield value;
                let mut stream = Self::traverse_forward(child);
                while let Some(res) = stream.next().await { yield res?; }
            }
        }
    }

    fn traverse_forward(mut n: Explore) -> Pin<Box<dyn Stream<Item = Result<String, reqwest::Error>> + Send>> {
        Box::pin(try_stream! {
            n.dispatch().await?;
            let n_children = n.children();
            let n_values = n.values();
            for (n_idx, n_child) in n_children.into_iter().enumerate() {
                if n_idx > 0 { yield n_values[n_idx].clone(); }
                let mut stream = Self::traverse_forward(n_child);
                while let Some(res) = stream.next().await { yield res?; }
            }
        })
    }

    pub fn backward(self) -> impl Stream<Item = Result<String, reqwest::Error>> + Send {
        try_stream! {
            let children = self.children();
            let values = self.values();
            for (value, child) in values.into_iter().rev().zip(children.into_iter().rev()) {
                let mut stream = Self::traverse_backward(child);
                while let Some(res) = stream.next().await { yield res?; }
                yield value;
            }
        }
    }

    fn traverse_backward(mut n: Explore) -> Pin<Box<dyn Stream<Item = Result<String, reqwest::Error>> + Send>> {
        Box::pin(try_stream! {
            n.dispatch().await?;
            let n_children = n.children();
            let n_values = n.values();
            for (n_idx, n_child) in n_children.into_iter().rev().enumerate() {
                let mut stream = Self::traverse_backward(n_child);
                while let Some(res) = stream.next().await { yield res?; }
                yield n_values[n_values.len() - n_idx - 1].clone();
            }
        })
    }
}

/// Converts a list of string tokens into a MeTTa S-expression pattern.
/// For example, `["foo", "bar"]` becomes `"(foo (bar $))"`.
pub fn tokens_to_sexpr<S: AsRef<str>>(tokens: &[S]) -> String {
    let mut sexpr = String::from("$");
    for token in tokens.iter().rev() {
        sexpr = format!("({} {})", token.as_ref(), sexpr);
    }
    sexpr
}

/// Converts a list of string tokens into a path string.
/// For example, `["foo", "bar"]` becomes `"foo/bar"`.
pub fn tokens_to_path<S: AsRef<str>>(tokens: &[S]) -> String {
    let parts: Vec<&str> = tokens.iter().map(|t| t.as_ref()).collect();
    parts.join("/")
}

pub async fn explore_fringe_bfs_2_levels<S: AsRef<str> + Clone>(
    client: Arc<Client>,
    base_url: &str,
    space_root_path_tokens: &[String],
    target_path_tokens: &[S],
) -> Result<Vec<Vec<String>>, reqwest::Error> {
    let mut new_fringe = Vec::new();
    let explore_base_pattern = tokens_to_sexpr(space_root_path_tokens);
    let base_len = target_path_tokens.len();
    let explore = Explore::new(client.clone(), base_url.to_string(), explore_base_pattern.clone(), String::new());
    let mut next_paths = HashSet::new();

    let extract_path = |expr: &str| -> Vec<String> {
        let cleaned = expr.replace(['(', ')'], "").replace("$", "");
        cleaned.split_whitespace().map(|s| s.to_string()).collect()
    };

    let mut mork_frontier = VecDeque::new();
    mork_frontier.push_back(explore);
    let mut processed_nodes = 0;

    while let Some(mut current) = mork_frontier.pop_front() {
        if processed_nodes >= 200 { break; }
        processed_nodes += 1;

        if let Err(e) = current.dispatch().await {
            eprintln!("Error dispatching MORK explore: {}", e);
            continue;
        }

        if let Some(data) = current.data.as_ref() {
            for node in data {
                let parsed_full_path = extract_path(&node.expr);
                if parsed_full_path.len() >= space_root_path_tokens.len()
                    && parsed_full_path[0..space_root_path_tokens.len()] == *space_root_path_tokens
                {
                    let relative_path: Vec<String> = parsed_full_path[space_root_path_tokens.len()..].to_vec();
                    if relative_path.starts_with(&target_path_tokens.iter().map(|s| s.as_ref().to_string()).collect::<Vec<String>>()) {
                        let relative_base_len = target_path_tokens.len();
                        let target_len = std::cmp::min(relative_path.len(), relative_base_len + 2);
                        if target_len > relative_base_len {
                            let mut sub_path = relative_path[0..target_len].to_vec();
                            if relative_path.len() > target_len { sub_path.push("$".to_string()); }
                            let mut final_path = space_root_path_tokens.to_vec();
                            final_path.extend(sub_path);
                            next_paths.insert(final_path);
                        } else if relative_path.len() == relative_base_len && !relative_path.is_empty() {
                            if relative_path.len() <= relative_base_len + 2 {
                                let mut final_path = space_root_path_tokens.to_vec();
                                final_path.extend(relative_path);
                                next_paths.insert(final_path);
                            }
                        }
                    }
                }
            }
        }

        for child in current.children() {
            mork_frontier.push_back(child);
        }
    }

    for path in next_paths { new_fringe.push(path); }
    new_fringe.sort();
    new_fringe.dedup();
    Ok(new_fringe)
}

// ─── Permission ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum PermissionError {
    ReadRequired,
    WriteRequired,
    NamespaceMismatch { path: String, namespace: String },
}

impl std::fmt::Display for PermissionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionError::ReadRequired => write!(f, "read permission required"),
            PermissionError::WriteRequired => write!(f, "write permission required"),
            PermissionError::NamespaceMismatch { path, namespace } => {
                write!(f, "path '{}' is outside token namespace '{}'", path, namespace)
            }
        }
    }
}

/// Permissions derived from a token, used to gate every MORK operation.
#[derive(Debug, Clone)]
pub struct Permission {
    /// Token namespace without leading slash, e.g. `"space/sub"` or `""` for root.
    pub namespace: String,
    pub can_read: bool,
    pub can_write: bool,
}

impl Permission {
    pub fn new(namespace: impl Into<String>, can_read: bool, can_write: bool) -> Self {
        Self { namespace: namespace.into(), can_read, can_write }
    }

    pub fn require_read(&self) -> Result<(), PermissionError> {
        if self.can_read { Ok(()) } else { Err(PermissionError::ReadRequired) }
    }

    pub fn require_write(&self) -> Result<(), PermissionError> {
        if self.can_write { Ok(()) } else { Err(PermissionError::WriteRequired) }
    }

    /// Returns an error if `path` is not under this token's namespace.
    pub fn check_namespace(&self, path: &Path) -> Result<(), PermissionError> {
        if self.namespace.is_empty() { return Ok(()); }
        if !path.starts_with(&self.namespace) {
            return Err(PermissionError::NamespaceMismatch {
                path: path.to_string_lossy().into_owned(),
                namespace: self.namespace.clone(),
            });
        }
        Ok(())
    }
}

// ─── Error ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum MorkError {
    Permission(PermissionError),
    Http(reqwest::Error),
    BadStatus(u16),
    Timeout,
}

impl From<PermissionError> for MorkError {
    fn from(e: PermissionError) -> Self { MorkError::Permission(e) }
}

impl From<reqwest::Error> for MorkError {
    fn from(e: reqwest::Error) -> Self { MorkError::Http(e) }
}

// ─── Path helper ────────────────────────────────────────────────────────────

/// Converts a filesystem path into a MeTTa S-expression pattern.
/// E.g. `foo/bar` → `"(foo (bar $))"`, empty path → `"$"`.
pub fn path_to_sexpr(path: &Path) -> String {
    let mut sexpr = String::from("$");
    for component in path.components().rev() {
        if let Component::Normal(name) = component {
            sexpr = format!("({} {})", name.to_string_lossy(), sexpr);
        }
    }
    sexpr
}

// ─── MorkClient ─────────────────────────────────────────────────────────────

/// HTTP client for all MORK operations. Every method enforces the supplied
/// [`Permission`] before issuing any network request.
#[derive(Clone, Debug)]
pub struct MorkClient {
    client: Arc<Client>,
    pub base_url: String,
}

impl MorkClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self { client: Arc::new(Client::new()), base_url: base_url.into() }
    }

    fn base(&self) -> &str {
        self.base_url.trim_end_matches('/')
    }

    fn enc(s: &str) -> String {
        percent_encode(s.as_bytes(), NON_ALPHANUMERIC).to_string()
    }

    /// Import MeTTa content served at `uri` into `path`. Requires write.
    pub async fn import(&self, perm: &Permission, path: &Path, uri: &str) -> Result<(), MorkError> {
        perm.require_write()?;
        perm.check_namespace(path)?;

        let template = path_to_sexpr(path);
        let url = format!(
            "{}/import/{}/{}?uri={}",
            self.base(),
            Self::enc("$"),
            Self::enc(&template),
            Self::enc(uri),
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    /// Export all MeTTa content at `path`. Requires read.
    pub async fn export(&self, perm: &Permission, path: &Path) -> Result<String, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let url = format!(
            "{}/export/{}/{}",
            self.base(),
            Self::enc(&pattern),
            Self::enc("$"),
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(resp.text().await?)
    }

    /// Delete all data at `path`. Requires write.
    pub async fn clear(&self, perm: &Permission, path: &Path) -> Result<(), MorkError> {
        perm.require_write()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let url = format!("{}/clear/{}", self.base(), Self::enc(&pattern));
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    /// Copy `src_path` to `dst_path`. Requires read + write on both.
    pub async fn copy(&self, perm: &Permission, src_path: &Path, dst_path: &Path) -> Result<(), MorkError> {
        perm.require_read()?;
        perm.require_write()?;
        perm.check_namespace(src_path)?;
        perm.check_namespace(dst_path)?;

        let url = format!(
            "{}/copy/{}/{}",
            self.base(),
            Self::enc(&path_to_sexpr(src_path)),
            Self::enc(&path_to_sexpr(dst_path)),
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    /// Apply a multi-space transformation. Requires read + write on all spaces.
    pub async fn transform(
        &self,
        perm: &Permission,
        input_spaces: &[(&Path, &str)],
        output_spaces: &[(&Path, &str)],
    ) -> Result<(), MorkError> {
        perm.require_read()?;
        perm.require_write()?;
        for (path, _) in input_spaces.iter().chain(output_spaces.iter()) {
            perm.check_namespace(path)?;
        }

        let patterns: Vec<String> = input_spaces.iter()
            .map(|(path, pat)| path_to_sexpr(path).replace("$", pat))
            .collect();
        let templates: Vec<String> = output_spaces.iter()
            .map(|(path, tmpl)| path_to_sexpr(path).replace("$", tmpl))
            .collect();
        let body = format!("(transform (, {}) (, {}) )", patterns.join(" "), templates.join(" "));

        let url = format!("{}/transform", self.base());
        let resp = self.client.post(&url).body(body).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    /// Wait for a space lock. Requires write if `is_writer`, read otherwise.
    pub async fn busywait(
        &self,
        perm: &Permission,
        path: &Path,
        millis: u64,
        is_writer: bool,
    ) -> Result<String, MorkError> {
        perm.check_namespace(path)?;
        if is_writer { perm.require_write()? } else { perm.require_read()? };

        let pattern = path_to_sexpr(path);
        let mut url = format!(
            "{}/busywait/{}/?expr1={}",
            self.base(), millis, Self::enc(&pattern),
        );
        if is_writer { url.push_str("&writer1"); }
        let resp = self.client.get(&url).send().await?;
        Ok(resp.text().await?)
    }

    /// Poll the status of a space operation. Requires read.
    pub async fn status(&self, perm: &Permission, path: &Path) -> Result<serde_json::Value, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let url = format!("{}/status/{}", self.base(), Self::enc(&pattern));
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        let text = resp.text().await?;
        serde_json::from_str(&text).map_err(|_| MorkError::BadStatus(0))
    }

    /// Count atoms at `path`, polling until the result is ready. Requires read.
    pub async fn count(&self, perm: &Permission, path: &Path) -> Result<usize, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let count_url = format!("{}/count/{}", self.base(), Self::enc(&pattern));
        let status_url = format!("{}/status/{}", self.base(), Self::enc(&pattern));

        let resp = self.client.get(&count_url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }

        for _ in 0..10 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if let Ok(status_resp) = self.client.get(&status_url).send().await {
                if let Ok(text) = status_resp.text().await {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                        if json["status"] == "countResult" {
                            if let Some(n) = json["count"].as_u64() {
                                return Ok(n as usize);
                            }
                        }
                    }
                }
            }
        }
        Err(MorkError::Timeout)
    }

    /// Explore the trie structure two levels deep. Requires read.
    pub async fn explore(
        &self,
        perm: &Permission,
        space_root_tokens: &[String],
        target_path_tokens: &[String],
    ) -> Result<Vec<Vec<String>>, MorkError> {
        perm.require_read()?;
        let space_root_path = PathBuf::from(space_root_tokens.join("/"));
        perm.check_namespace(&space_root_path)?;

        explore_fringe_bfs_2_levels(
            self.client.clone(),
            &self.base_url,
            space_root_tokens,
            target_path_tokens,
        )
        .await
        .map_err(MorkError::Http)
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// A MorkClient pointed at a port nothing is listening on.
    /// Permission checks fire before any network I/O, so connection errors
    /// will never appear in these tests.
    fn client() -> MorkClient {
        MorkClient::new("http://127.0.0.1:19999")
    }

    fn read_only(ns: &str) -> Permission { Permission::new(ns, true, false) }
    fn write_only(ns: &str) -> Permission { Permission::new(ns, false, true) }
    fn read_write(ns: &str) -> Permission { Permission::new(ns, true, true) }

    // ── import ───────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn import_requires_write() {
        let err = client()
            .import(&read_only(""), Path::new("space/sub"), "http://x/f.metta")
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::WriteRequired)));
    }

    #[tokio::test]
    async fn import_rejects_wrong_namespace() {
        let err = client()
            .import(&read_write("other"), Path::new("space/sub"), "http://x/f.metta")
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── export ───────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn export_requires_read() {
        let err = client()
            .export(&write_only(""), Path::new("space/sub"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn export_rejects_wrong_namespace() {
        let err = client()
            .export(&read_write("other"), Path::new("space/sub"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── clear ────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn clear_requires_write() {
        let err = client()
            .clear(&read_only(""), Path::new("space/sub"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::WriteRequired)));
    }

    #[tokio::test]
    async fn clear_rejects_wrong_namespace() {
        let err = client()
            .clear(&read_write("other"), Path::new("space/sub"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── copy ─────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn copy_requires_read() {
        let err = client()
            .copy(&write_only(""), Path::new("a"), Path::new("b"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn copy_requires_write() {
        let err = client()
            .copy(&read_only(""), Path::new("a"), Path::new("b"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::WriteRequired)));
    }

    #[tokio::test]
    async fn copy_rejects_wrong_namespace_on_src() {
        let err = client()
            .copy(&read_write("space"), Path::new("other/x"), Path::new("space/y"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    #[tokio::test]
    async fn copy_rejects_wrong_namespace_on_dst() {
        let err = client()
            .copy(&read_write("space"), Path::new("space/x"), Path::new("other/y"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── transform ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn transform_requires_read() {
        let input = [(Path::new("a") as &Path, "x")];
        let output = [(Path::new("b") as &Path, "y")];
        let err = client()
            .transform(&write_only(""), &input, &output)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn transform_requires_write() {
        let input = [(Path::new("a") as &Path, "x")];
        let output = [(Path::new("b") as &Path, "y")];
        let err = client()
            .transform(&read_only(""), &input, &output)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::WriteRequired)));
    }

    #[tokio::test]
    async fn transform_rejects_wrong_namespace() {
        let input = [(Path::new("other/a") as &Path, "x")];
        let output = [(Path::new("space/b") as &Path, "y")];
        let err = client()
            .transform(&read_write("space"), &input, &output)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── busywait ─────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn busywait_reader_requires_read() {
        let err = client()
            .busywait(&write_only(""), Path::new("space"), 100, false)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn busywait_writer_requires_write() {
        let err = client()
            .busywait(&read_only(""), Path::new("space"), 100, true)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::WriteRequired)));
    }

    #[tokio::test]
    async fn busywait_rejects_wrong_namespace() {
        let err = client()
            .busywait(&read_write("space"), Path::new("other"), 100, false)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── status ───────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn status_requires_read() {
        let err = client()
            .status(&write_only(""), Path::new("space"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn status_rejects_wrong_namespace() {
        let err = client()
            .status(&read_write("space"), Path::new("other"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── count ────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn count_requires_read() {
        let err = client()
            .count(&write_only(""), Path::new("space"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn count_rejects_wrong_namespace() {
        let err = client()
            .count(&read_write("space"), Path::new("other"))
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── explore ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn explore_requires_read() {
        let root = vec!["space".to_string()];
        let target = vec!["space".to_string()];
        let err = client()
            .explore(&write_only(""), &root, &target)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::ReadRequired)));
    }

    #[tokio::test]
    async fn explore_rejects_wrong_namespace() {
        let root = vec!["other".to_string()];
        let target = vec![];
        let err = client()
            .explore(&read_write("space"), &root, &target)
            .await.unwrap_err();
        assert!(matches!(err, MorkError::Permission(PermissionError::NamespaceMismatch { .. })));
    }

    // ── Permission unit tests ─────────────────────────────────────────────────

    #[test]
    fn empty_namespace_allows_any_path() {
        let p = read_write("");
        assert!(p.check_namespace(Path::new("anything/at/all")).is_ok());
    }

    #[test]
    fn namespace_allows_exact_match() {
        let p = read_write("space");
        assert!(p.check_namespace(Path::new("space")).is_ok());
    }

    #[test]
    fn namespace_allows_subpath() {
        let p = read_write("space");
        assert!(p.check_namespace(Path::new("space/sub/deep")).is_ok());
    }

    #[test]
    fn namespace_rejects_sibling() {
        let p = read_write("space");
        assert!(p.check_namespace(Path::new("other")).is_err());
    }

    #[test]
    fn path_to_sexpr_empty() {
        assert_eq!(path_to_sexpr(Path::new("")), "$");
    }

    #[test]
    fn path_to_sexpr_single() {
        assert_eq!(path_to_sexpr(Path::new("foo")), "(foo $)");
    }

    #[test]
    fn path_to_sexpr_nested() {
        assert_eq!(path_to_sexpr(Path::new("foo/bar")), "(foo (bar $))");
    }
}
