use percent_encoding::{NON_ALPHANUMERIC, percent_encode};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::future::Future;
use std::path::{Component, Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;

// ─── API Response Types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MORKExploreResponse {
    pub expr: String,
    pub token: Vec<u8>,
    pub cnt: usize,
}

// ─── Public Result Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceInfo {
    pub namespace: PathBuf,
    pub subnamespaces: Option<Vec<NamespaceInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExploreResult {
    pub namespace: PathBuf,
    pub metta_expressions: Vec<String>,
    pub subspaces: Vec<(String, PathBuf)>,
    pub focus_token: Option<String>,
}

// ─── S-Expression Utilities ─────────────────────────────────────────────────

/// Count the arity (number of top-level elements) of an S-expression.
/// Returns 0 for atoms (non-parenthesized values).
pub fn arity(expr: &str) -> usize {
    let trimmed = expr.trim();

    if !trimmed.starts_with('(') || !trimmed.ends_with(')') {
        return 0;
    }

    let inner = &trimmed[1..trimmed.len() - 1];
    let mut count = 0;
    let mut depth = 0;
    let mut in_token = false;

    for ch in inner.chars() {
        match ch {
            '(' => {
                if depth == 0 && !in_token {
                    in_token = true;
                    count += 1;
                }
                depth += 1;
            }
            ')' => {
                depth -= 1;
                if depth == 0 {
                    in_token = false;
                }
            }
            c if c.is_whitespace() => {
                if depth == 0 {
                    in_token = false;
                }
            }
            _ => {
                if depth == 0 && !in_token {
                    in_token = true;
                    count += 1;
                }
            }
        }
    }

    count
}

/// Check if parentheses are balanced in a string.
pub fn is_balanced(s: &str) -> bool {
    let mut depth = 0;
    for c in s.chars() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

/// Parse a binary S-expression into (lhs, rhs).
/// Returns None if not binary or LHS is not a simple symbol.
pub fn parse_binary_sexp(input: &str) -> Option<(&str, &str)> {
    if arity(input) != 2 {
        return None;
    }

    let inner = input.trim().strip_prefix('(')?.strip_suffix(')')?;
    let (lhs, rhs) = inner.split_once(' ')?;

    // LHS must be a simple symbol (no parens)
    if lhs.contains('(') || lhs.contains(')') {
        return None;
    }

    if is_balanced(rhs) {
        Some((lhs, rhs.trim()))
    } else {
        None
    }
}

/// Strip a path prefix from an S-expression.
/// E.g., strip_prefix("(a (b c))", "a") -> Some("(b c)")
pub fn strip_prefix(input: &str, path: &Path) -> Option<String> {
    let mut inner = input;

    for component in path.components() {
        inner = inner.trim().strip_prefix('(')?.strip_suffix(')')?.trim();

        if let Some(s) = component.as_os_str().to_str() {
            inner = inner.strip_prefix(s)?.trim();
        }
    }

    Some(inner.trim().to_string())
}

/// Convert a path to a MeTTa S-expression pattern.
/// E.g., "foo/bar" -> "(foo (bar $))", "" -> "$"
pub fn path_to_sexpr(path: &Path) -> String {
    let mut sexpr = String::from("$");
    for component in path.components().rev() {
        if let Component::Normal(name) = component {
            sexpr = format!("({} {})", name.to_string_lossy(), sexpr);
        }
    }
    sexpr
}

/// URL-encode a string for MORK API calls.
fn encode(s: &str) -> String {
    percent_encode(s.as_bytes(), NON_ALPHANUMERIC).to_string()
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
                write!(
                    f,
                    "path '{}' is outside token namespace '{}'",
                    path, namespace
                )
            }
        }
    }
}

/// Permissions derived from a token, used to gate every MORK operation.
#[derive(Debug, Clone)]
pub struct Permission {
    pub namespace: String,
    pub can_read: bool,
    pub can_write: bool,
}

impl Permission {
    pub fn new(namespace: impl Into<String>, can_read: bool, can_write: bool) -> Self {
        Self {
            namespace: namespace.into(),
            can_read,
            can_write,
        }
    }

    pub fn require_read(&self) -> Result<(), PermissionError> {
        if self.can_read {
            Ok(())
        } else {
            Err(PermissionError::ReadRequired)
        }
    }

    pub fn require_write(&self) -> Result<(), PermissionError> {
        if self.can_write {
            Ok(())
        } else {
            Err(PermissionError::WriteRequired)
        }
    }

    pub fn check_namespace(&self, path: &Path) -> Result<(), PermissionError> {
        if self.namespace.is_empty() {
            return Ok(());
        }
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
    fn from(e: PermissionError) -> Self {
        MorkError::Permission(e)
    }
}

impl From<reqwest::Error> for MorkError {
    fn from(e: reqwest::Error) -> Self {
        MorkError::Http(e)
    }
}

// ─── MorkClient ─────────────────────────────────────────────────────────────

/// HTTP client for all MORK operations.
#[derive(Clone, Debug)]
pub struct MorkClient {
    client: Arc<Client>,
    pub base_url: String,
}

impl MorkClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            client: Arc::new(Client::new()),
            base_url: base_url.into(),
        }
    }

    fn base(&self) -> &str {
        self.base_url.trim_end_matches('/')
    }

    // ─── Basic Operations ───────────────────────────────────────────────────

    pub async fn import(
        &self,
        perm: &Permission,
        path: &Path,
        pattern: &str,
        template: &str,
        uri: &str,
    ) -> Result<(), MorkError> {
        perm.require_write()?;
        perm.check_namespace(path)?;

        let path_pattern = path_to_sexpr(path);
        let pattern = path_pattern.replace("$", pattern);

        let path_template = path_to_sexpr(path);
        let template = path_template.replace("$", template);

        let url = format!(
            "{}/import/{}/{}?uri={}",
            self.base(),
            encode(&pattern),
            encode(&template),
            encode(uri),
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn export(
        &self,
        perm: &Permission,
        path: &Path,
        pattern: &str,
        template: &str,
    ) -> Result<String, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let path_pattern = path_to_sexpr(path);
        let pattern = path_pattern.replace("$", pattern);

        let path_template = path_to_sexpr(path);
        let template = path_template.replace("$", template);

        let url = format!(
            "{}/export/{}/{}",
            self.base(),
            encode(&pattern),
            encode(&template)
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(resp.text().await?)
    }

    pub async fn clear(
        &self,
        perm: &Permission,
        path: &Path,
        pattern: &str,
    ) -> Result<(), MorkError> {
        perm.require_write()?;
        perm.check_namespace(path)?;

        let path_pattern = path_to_sexpr(path);
        let pattern = path_pattern.replace("$", pattern);

        let url = format!("{}/clear/{}", self.base(), encode(&pattern));
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn copy(&self, perm: &Permission, src: &Path, dst: &Path) -> Result<(), MorkError> {
        perm.require_read()?;
        perm.require_write()?;
        perm.check_namespace(src)?;
        perm.check_namespace(dst)?;

        let url = format!(
            "{}/copy/{}/{}",
            self.base(),
            encode(&path_to_sexpr(src)),
            encode(&path_to_sexpr(dst)),
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

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

        let patterns: Vec<String> = input_spaces
            .iter()
            .map(|(path, pat)| path_to_sexpr(path).replace("$", pat))
            .collect();
        let templates: Vec<String> = output_spaces
            .iter()
            .map(|(path, tmpl)| path_to_sexpr(path).replace("$", tmpl))
            .collect();
        let body = format!(
            "(transform (, {}) (, {}) )",
            patterns.join(" "),
            templates.join(" ")
        );

        let url = format!("{}/transform", self.base());
        let resp = self.client.post(&url).body(body).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn busywait(
        &self,
        perm: &Permission,
        path: &Path,
        millis: u64,
        is_writer: bool,
    ) -> Result<String, MorkError> {
        perm.check_namespace(path)?;
        if is_writer {
            perm.require_write()?;
        } else {
            perm.require_read()?;
        }

        let pattern = path_to_sexpr(path);
        let mut url = format!(
            "{}/busywait/{}/?expr1={}",
            self.base(),
            millis,
            encode(&pattern),
        );
        if is_writer {
            url.push_str("&writer1");
        }
        let resp = self.client.get(&url).send().await?;
        Ok(resp.text().await?)
    }

    pub async fn status(
        &self,
        perm: &Permission,
        path: &Path,
    ) -> Result<serde_json::Value, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let url = format!("{}/status/{}", self.base(), encode(&pattern));
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        let text = resp.text().await?;
        serde_json::from_str(&text).map_err(|_| MorkError::BadStatus(0))
    }

    pub async fn count(&self, perm: &Permission, path: &Path) -> Result<usize, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        let count_url = format!("{}/count/{}", self.base(), encode(&pattern));
        let status_url = format!("{}/status/{}", self.base(), encode(&pattern));

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

    // ─── Explore Operations ─────────────────────────────────────────────────

    /// Low-level MORK explore call. Returns raw expression/token pairs.
    async fn explore_raw(
        &self,
        pattern: &str,
        token: &str,
    ) -> Result<Vec<MORKExploreResponse>, MorkError> {
        let url = if token.is_empty() {
            format!("{}/explore/{}//", self.base(), encode(pattern))
        } else {
            format!("{}/explore/{}/{}/", self.base(), encode(pattern), token)
        };

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(resp.json().await?)
    }

    /// Explore a namespace and return subspaces and plain metta expressions.
    ///
    /// Uses two-phase approach to minimize requests on large spaces:
    /// - Phase 1 (BFS): Discover ALL subspaces (only on first request)
    /// - Phase 2 (DFS): Collect metta_expressions with pagination (50 per page)
    ///
    /// The focus_token encodes the DFS stack state for continuation.
    pub async fn explore(
        &self,
        perm: &Permission,
        path: &PathBuf,
        focus_token: &str,
    ) -> Result<ExploreResult, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let pattern = path_to_sexpr(path);
        const PAGE_SIZE: usize = 100;

        let mut subspaces: Vec<(String, PathBuf)> = Vec::new();
        let mut metta_expressions: Vec<String> = Vec::new();
        let mut next_focus_token: Option<String> = None;

        let mut visited_tokens: HashSet<String> = HashSet::new();
        let mut skip_tokens: HashSet<String> = HashSet::new();

        let mut bfs_request_count = 0;
        if focus_token.is_empty() {
            let mut subspace_symbols: HashSet<String> = HashSet::new();
            let mut queue: VecDeque<(String, usize)> = VecDeque::new(); // (token, depth)

            queue.push_back((String::new(), 0));
            visited_tokens.insert(String::new());

            const MAX_BFS_DEPTH: usize = 2;

            while let Some((current_token, depth)) = queue.pop_front() {
                if depth >= MAX_BFS_DEPTH {
                    continue;
                }
                bfs_request_count += 1;
                let responses = self.explore_raw(&pattern, &current_token).await?;

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        // Collect all unique LHS symbols
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            subspace_symbols.insert(lhs.to_string());
                        }
                    }
                }

                let all_binary = responses
                    .clone()
                    .into_iter()
                    .map(|r| r.expr)
                    .all(|e: String| {
                        if let Some(relative_expr) = strip_prefix(&e, path) {
                            return parse_binary_sexp(&relative_expr).is_some();
                        }
                        false
                    });

                if all_binary && responses.len() >= 1 {
                    let response = responses.first().unwrap();

                    if let Some(relative_expr) = strip_prefix(&response.expr, path)
                        && all_binary
                    {
                        if parse_binary_sexp(&relative_expr).is_some() {
                            // Mark as visited so DFS skips these binary-only branches
                            let encoded_token =
                                percent_encode(&response.token, NON_ALPHANUMERIC).to_string();
                            visited_tokens.insert(encoded_token.clone());
                            skip_tokens.insert(current_token.clone());
                        }
                    }

                    continue;
                }

                for response in responses {
                    let encoded_token =
                        percent_encode(&response.token, NON_ALPHANUMERIC).to_string();

                    if visited_tokens.insert(encoded_token.clone()) {
                        queue.push_back((encoded_token, depth + 1));
                    }
                }
            }

            subspaces = subspace_symbols
                .into_iter()
                .map(|symbol| {
                    let display = format!("({} |$|)", symbol);
                    let subpath = path.join(&symbol);
                    (display, subpath)
                })
                .collect();
        }

        let mut stack: Vec<String> = Vec::new();

        if focus_token.is_empty() {
            stack.push(String::new());
        } else {
            if let Ok(tokens) = serde_json::from_str::<Vec<String>>(focus_token) {
                stack = tokens;
            } else {
                stack.push(String::new());
            }
        }

        let mut dfs_request_count = 0;
        while let Some(current_token) = stack.pop() {
            if !skip_tokens.insert(current_token.clone()) {
                continue;
            }

            dfs_request_count += 1;
            let responses = self.explore_raw(&pattern, &current_token).await?;

            let nr_of_responses = responses.len();

            for response in responses {
                let relative_expr = match strip_prefix(&response.expr, path) {
                    Some(s) => s,
                    None => continue,
                };

                let encoded_token = percent_encode(&response.token, NON_ALPHANUMERIC).to_string();

                if parse_binary_sexp(&relative_expr).is_some() {
                    continue;
                }

                if !metta_expressions.contains(&relative_expr) && nr_of_responses == 1 {
                    metta_expressions.push(relative_expr);

                    if metta_expressions.len() >= PAGE_SIZE {
                        if !stack.is_empty() {
                            next_focus_token =
                                Some(serde_json::to_string(&stack).unwrap_or_default());
                        }
                        break;
                    }
                } else {
                    if !skip_tokens.contains(&encoded_token) {
                        stack.push(encoded_token);
                    }
                }
            }

            if metta_expressions.len() >= PAGE_SIZE {
                break;
            }
        }

        Ok(ExploreResult {
            namespace: path.clone(),
            metta_expressions,
            subspaces,
            focus_token: next_focus_token,
        })
    }

    /// Explore namespaces (for namespace selector UI).
    /// Uses BFS to traverse the trie and find all unique subnamespaces.
    /// Stops when encountering only 1 child with a binary s-expression.
    pub fn explore_namespaces<'a>(
        &'a self,
        perm: &'a Permission,
        path: &'a PathBuf,
    ) -> Pin<Box<dyn Future<Output = Result<NamespaceInfo, MorkError>> + Send + 'a>> {
        Box::pin(async move {
            perm.require_read()?;
            perm.check_namespace(path)?;

            let pattern = path_to_sexpr(path);

            let mut subnamespace_symbols: HashSet<String> = HashSet::new();
            let mut visited_tokens: HashSet<String> = HashSet::new();
            let mut queue: VecDeque<(String, usize)> = VecDeque::new(); // (token, depth)

            queue.push_back((String::new(), 0));
            visited_tokens.insert(String::new());

            const MAX_BFS_DEPTH: usize = 3;

            while let Some((current_token, depth)) = queue.pop_front() {
                if depth >= MAX_BFS_DEPTH {
                    continue;
                }
                let responses = self.explore_raw(&pattern, &current_token).await?;

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            subnamespace_symbols.insert(lhs.to_string());
                        }
                    }
                }

                if let Some(relative_expr) = strip_prefix(&responses[0].expr, path) {
                    if parse_binary_sexp(&relative_expr).is_some() {
                        let encoded_token =
                            percent_encode(&responses[0].token, NON_ALPHANUMERIC).to_string();
                        visited_tokens.insert(encoded_token);
                        continue;
                    }
                }

                for response in responses {
                    let encoded_token =
                        percent_encode(&response.token, NON_ALPHANUMERIC).to_string();
                    if visited_tokens.insert(encoded_token.clone()) {
                        queue.push_back((encoded_token, depth + 1));
                    }
                }
            }

            // Recursively explore each subnamespace
            let mut subnamespaces: Vec<NamespaceInfo> = Vec::new();
            for symbol in subnamespace_symbols {
                let subnamespace_path = path.join(&symbol);

                // Recursively explore this subnamespace
                match self.explore_namespaces(perm, &subnamespace_path).await {
                    Ok(subnamespace_info) => subnamespaces.push(subnamespace_info),
                    Err(e) => {
                        // Log the error but continue with other subnamespaces
                        eprintln!(
                            "Error exploring subnamespace {:?}: {:?}",
                            subnamespace_path, e
                        );
                    }
                }
            }

            Ok(NamespaceInfo {
                namespace: path.clone(),
                subnamespaces: if subnamespaces.is_empty() {
                    None
                } else {
                    Some(subnamespaces)
                },
            })
        })
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> MorkClient {
        MorkClient::new("http://127.0.0.1:19999")
    }

    fn read_only(ns: &str) -> Permission {
        Permission::new(ns, true, false)
    }
    fn write_only(ns: &str) -> Permission {
        Permission::new(ns, false, true)
    }
    fn read_write(ns: &str) -> Permission {
        Permission::new(ns, true, true)
    }

    // ── Arity tests ─────────────────────────────────────────────────────────

    #[test]
    fn arity_atom() {
        assert_eq!(arity("x"), 0);
        assert_eq!(arity("hello"), 0);
    }

    #[test]
    fn arity_binary() {
        assert_eq!(arity("(a b)"), 2);
        assert_eq!(arity("(a (b c))"), 2);
    }

    #[test]
    fn arity_ternary() {
        assert_eq!(arity("(a b c)"), 3);
        assert_eq!(arity("(aha hoho hihi)"), 3);
    }

    #[test]
    fn arity_complex_lhs() {
        assert_eq!(arity("((X) Y)"), 2);
    }

    // ── parse_binary_sexp tests ─────────────────────────────────────────────

    #[test]
    fn parse_binary_simple() {
        assert_eq!(parse_binary_sexp("(a b)"), Some(("a", "b")));
    }

    #[test]
    fn parse_binary_nested_rhs() {
        assert_eq!(parse_binary_sexp("(a (b c))"), Some(("a", "(b c)")));
    }

    #[test]
    fn parse_binary_complex_lhs_returns_none() {
        assert_eq!(parse_binary_sexp("((X) Y)"), None);
    }

    #[test]
    fn parse_non_binary_returns_none() {
        assert_eq!(parse_binary_sexp("(a b c)"), None);
        assert_eq!(parse_binary_sexp("x"), None);
    }

    // ── Permission tests ────────────────────────────────────────────────────

    #[tokio::test]
    async fn import_requires_write() {
        let err = client()
            .import(
                &read_only(""),
                Path::new("space/sub"),
                "$",
                "$",
                "http://x/f.metta",
            )
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::WriteRequired)
        ));
    }

    #[tokio::test]
    async fn import_rejects_wrong_namespace() {
        let err = client()
            .import(
                &read_write("other"),
                Path::new("space/sub"),
                "$",
                "$",
                "http://x/f.metta",
            )
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn export_requires_read() {
        let err = client()
            .export(&write_only(""), Path::new("space/sub"), "$", "$")
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn export_rejects_wrong_namespace() {
        let err = client()
            .export(&read_write("other"), Path::new("space/sub"), "$", "$")
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn clear_requires_write() {
        let err = client()
            .clear(&read_only(""), Path::new("space/sub"), None)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::WriteRequired)
        ));
    }

    #[tokio::test]
    async fn clear_rejects_wrong_namespace() {
        let err = client()
            .clear(&read_write("other"), Path::new("space/sub"), None)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn copy_requires_read() {
        let err = client()
            .copy(&write_only(""), Path::new("a"), Path::new("b"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn copy_requires_write() {
        let err = client()
            .copy(&read_only(""), Path::new("a"), Path::new("b"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::WriteRequired)
        ));
    }

    #[tokio::test]
    async fn copy_rejects_wrong_namespace_on_src() {
        let err = client()
            .copy(
                &read_write("space"),
                Path::new("other/x"),
                Path::new("space/y"),
            )
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn copy_rejects_wrong_namespace_on_dst() {
        let err = client()
            .copy(
                &read_write("space"),
                Path::new("space/x"),
                Path::new("other/y"),
            )
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn transform_requires_read() {
        let input = [(Path::new("a") as &Path, "x")];
        let output = [(Path::new("b") as &Path, "y")];
        let err = client()
            .transform(&write_only(""), &input, &output)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn transform_requires_write() {
        let input = [(Path::new("a") as &Path, "x")];
        let output = [(Path::new("b") as &Path, "y")];
        let err = client()
            .transform(&read_only(""), &input, &output)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::WriteRequired)
        ));
    }

    #[tokio::test]
    async fn transform_rejects_wrong_namespace() {
        let input = [(Path::new("other/a") as &Path, "x")];
        let output = [(Path::new("space/b") as &Path, "y")];
        let err = client()
            .transform(&read_write("space"), &input, &output)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn busywait_reader_requires_read() {
        let err = client()
            .busywait(&write_only(""), Path::new("space"), 100, false)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn busywait_writer_requires_write() {
        let err = client()
            .busywait(&read_only(""), Path::new("space"), 100, true)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::WriteRequired)
        ));
    }

    #[tokio::test]
    async fn busywait_rejects_wrong_namespace() {
        let err = client()
            .busywait(&read_write("space"), Path::new("other"), 100, false)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn status_requires_read() {
        let err = client()
            .status(&write_only(""), Path::new("space"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn status_rejects_wrong_namespace() {
        let err = client()
            .status(&read_write("space"), Path::new("other"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    #[tokio::test]
    async fn count_requires_read() {
        let err = client()
            .count(&write_only(""), Path::new("space"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::ReadRequired)
        ));
    }

    #[tokio::test]
    async fn count_rejects_wrong_namespace() {
        let err = client()
            .count(&read_write("space"), Path::new("other"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    // ── Path utility tests ──────────────────────────────────────────────────

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

    #[test]
    fn strip_prefix_simple() {
        let result = strip_prefix("(a b)", Path::new("a"));
        assert_eq!(result, Some("b".to_string()));
    }

    #[test]
    fn strip_prefix_nested() {
        let result = strip_prefix("(a (b c))", Path::new("a"));
        assert_eq!(result, Some("(b c)".to_string()));
    }

    #[test]
    fn strip_prefix_deep() {
        let result = strip_prefix("(a (b (c d)))", Path::new("a/b"));
        assert_eq!(result, Some("(c d)".to_string()));
    }
}
