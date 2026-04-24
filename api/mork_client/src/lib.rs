use chrono::Local;
use percent_encoding::{NON_ALPHANUMERIC, percent_decode_str, percent_encode};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::fmt;
use std::fs::{self, File};
use std::future::Future;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex as TokioMutex;

// ─── MorkLogger ─────────────────────────────────────────────────────────────

pub struct MorkLogger {
    pub session_dir: PathBuf,
    log_file: TokioMutex<File>,
}

static GLOBAL_LOGGER: OnceLock<Arc<MorkLogger>> = OnceLock::new();

impl MorkLogger {
    /// Initialize the global logger. Creates `<logs_base>/<timestamp>/requests.log`.
    /// Must be called once at process startup before any MORK requests are made.
    pub fn init(logs_base: impl AsRef<Path>) {
        let timestamp = Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
        let session_dir = logs_base.as_ref().join(&timestamp);
        fs::create_dir_all(&session_dir).expect("failed to create log session directory");
        let log_path = session_dir.join("requests.log");
        let log_file = File::create(&log_path).expect("failed to create requests.log");
        let logger = Arc::new(MorkLogger {
            session_dir,
            log_file: TokioMutex::new(log_file),
        });
        let _ = GLOBAL_LOGGER.set(logger);
    }

    pub fn get() -> Option<&'static Arc<MorkLogger>> {
        GLOBAL_LOGGER.get()
    }

    pub async fn log_request(&self, method: &str, url: &str, body: Option<&str>) {
        let decoded = percent_decode_str(url).decode_utf8_lossy().into_owned();
        let ts = Local::now().format("%Y-%m-%dT%H:%M:%S%.3f");
        let line = match body {
            Some(b) => format!("[{}] {} {}\n  BODY: {}\n\n", ts, method, decoded, b),
            None => format!("[{}] {} {}\n\n", ts, method, decoded),
        };
        let mut f = self.log_file.lock().await;
        let _ = f.write_all(line.as_bytes());
    }

    /// Copy a file from `static/<filename>` into the session directory.
    pub fn save_import_file(&self, filename: &str) {
        let src = PathBuf::from("static").join(filename);
        let dst = self.session_dir.join(filename);
        let _ = fs::copy(&src, &dst);
    }
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ExploreResult>>,
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
/// Quoted strings (`"..."`) are skipped so parens inside them are ignored.
pub fn is_balanced(s: &str) -> bool {
    let mut depth: i32 = 0;
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                // Skip the contents of a quoted string
                for c2 in chars.by_ref() {
                    if c2 == '"' {
                        break;
                    }
                }
            }
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

/// Check if a string is a single s-expression (must start with '(' and the
/// matching ')' must be at the very end of the trimmed string).
/// Quoted strings (`"..."`) are skipped so parens inside them are ignored.
pub fn is_sexpr(s: &str) -> bool {
    let s = s.trim();
    if !s.starts_with('(') {
        return false;
    }
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut depth: i32 = 0;
    let mut i = 0;
    while i < len {
        match chars[i] {
            '"' => {
                i += 1;
                while i < len && chars[i] != '"' {
                    i += 1;
                }
            }
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
                if depth == 0 && i != len - 1 {
                    return false;
                }
            }
            _ => {}
        }
        i += 1;
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

// ─── Error ──────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum MorkError {
    Http(reqwest::Error),
    BadStatus(u16),
    Timeout,
}

impl From<reqwest::Error> for MorkError {
    fn from(e: reqwest::Error) -> Self {
        MorkError::Http(e)
    }
}

impl fmt::Display for MorkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MorkError::Http(e) => write!(f, "HTTP request failed: {e}"),
            MorkError::BadStatus(code) => write!(f, "MORK returned status code {code}"),
            MorkError::Timeout => write!(f, "MORK connection timed out"),
        }
    }
}

impl std::error::Error for MorkError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            MorkError::Http(e) => Some(e),
            _ => None,
        }
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

    async fn log_get(&self, url: &str) {
        if let Some(logger) = MorkLogger::get() {
            logger.log_request("GET", url, None).await;
        }
    }

    async fn log_post(&self, url: &str, body: &str) {
        if let Some(logger) = MorkLogger::get() {
            logger.log_request("POST", url, Some(body)).await;
        }
    }

    // ─── Basic Operations ───────────────────────────────────────────────────

    pub async fn import(
        &self,
        path: &Path,
        pattern: &str,
        template: &str,
        uri: &str,
    ) -> Result<(), MorkError> {
        // let path_pattern = path_to_sexpr(path);
        // let pattern = path_pattern.replace("$", pattern);

        let path_template = path_to_sexpr(path);
        let template = path_template.replace("$", template);

        let url = format!(
            "{}/import/{}/{}?uri={}",
            self.base(),
            encode(&pattern),
            encode(&template),
            encode(uri),
        );
        self.log_get(&url).await;
        // Save the imported file to the log session directory if it's a local static file.
        if let Some(logger) = MorkLogger::get() {
            if let Some(filename) = uri.rsplit('/').next().filter(|f| !f.is_empty()) {
                logger.save_import_file(filename);
            }
        }
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn upload(
        &self,
        path: &Path,
        pattern: &str,
        template: &str,
        data: &str,
    ) -> Result<(), MorkError> {
        let path_template = path_to_sexpr(path);
        let template = path_template.replace("$", template);

        let url = format!(
            "{}/upload/{}/{}",
            self.base(),
            encode(&pattern),
            encode(&template),
        );
        self.log_post(&url, &data).await;
        let resp = self.client.post(&url).body(data.to_string()).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn export(
        &self,
        path: &Path,
        pattern: &str,
        template: &str,
    ) -> Result<String, MorkError> {
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
        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(resp.text().await?)
    }

    pub async fn clear(&self, path: &Path, pattern: &str) -> Result<(), MorkError> {
        let path_pattern = path_to_sexpr(path);
        let pattern = path_pattern.replace("$", pattern);

        let url = format!("{}/clear/{}", self.base(), encode(&pattern));
        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn copy(&self, src: &Path, dst: &Path) -> Result<(), MorkError> {
        let url = format!(
            "{}/copy/{}/{}",
            self.base(),
            encode(&path_to_sexpr(src)),
            encode(&path_to_sexpr(dst)),
        );
        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn transform(
        &self,
        input_spaces: &Vec<(PathBuf, &str)>,
        output_spaces: &Vec<(PathBuf, &str)>,
    ) -> Result<(), MorkError> {
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
        self.log_post(&url, &body).await;
        let resp = self.client.post(&url).body(body).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    pub async fn busywait(
        &self,
        path: &Path,
        millis: u64,
        is_writer: bool,
    ) -> Result<String, MorkError> {
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
        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        Ok(resp.text().await?)
    }

    pub async fn status(&self, path: &Path) -> Result<serde_json::Value, MorkError> {
        let pattern = path_to_sexpr(path);
        let url = format!("{}/status/{}", self.base(), encode(&pattern));
        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        let text = resp.text().await?;
        serde_json::from_str(&text).map_err(|_| MorkError::BadStatus(0))
    }

    /// Polls MORK's `/status/{path}` with exponential backoff until the path is
    /// no longer temporarily locked (`pathForbiddenTemporary` / `pathReadOnlyTemporary`).
    ///
    /// Returns `Ok(())` when the path is available, or `Err(MorkError::Timeout)` if
    /// `timeout_ms` elapses first.
    pub async fn wait_for_available(&self, path: &Path, timeout_ms: u64) -> Result<(), MorkError> {
        use tokio::time::{Duration, Instant, sleep};

        let pattern = path_to_sexpr(path);
        let url = format!("{}/status/{}", self.base(), encode(&pattern));
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        let mut interval_ms: u64 = 100;

        loop {
            let resp = self.client.get(&url).send().await?;
            let text = resp.text().await?;

            // Check if the status indicates a temporary lock
            let is_locked =
                text.contains("pathForbiddenTemporary") || text.contains("pathReadOnlyTemporary");

            if !is_locked {
                return Ok(());
            }

            if Instant::now() >= deadline {
                return Err(MorkError::Timeout);
            }

            sleep(Duration::from_millis(interval_ms)).await;
            interval_ms = (interval_ms * 2).min(1000); // cap at 1s
        }
    }

    pub async fn count(&self, path: &Path) -> Result<usize, MorkError> {
        let pattern = path_to_sexpr(path);
        let count_url = format!("{}/count/{}", self.base(), encode(&pattern));
        let status_url = format!("{}/status/{}", self.base(), encode(&pattern));

        self.log_get(&count_url).await;
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

    pub async fn exec(&self) -> Result<usize, MorkError> {
        let thread_url = format!("{}/metta_thread/?location=task_name", self.base());

        self.log_get(&thread_url).await;
        let resp = self.client.get(&thread_url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }

        Err(MorkError::Timeout)
    }

    pub async fn subtract(
        &self,
        input_spaces: &Vec<(PathBuf, &str)>,
        output_spaces: &Vec<(PathBuf, &str)>,
    ) -> Result<(), MorkError> {
        let patterns: Vec<String> = input_spaces
            .iter()
            .map(|(path, pat)| path_to_sexpr(path).replace("$", pat))
            .collect();
        let templates: Vec<String> = output_spaces
            .iter()
            .map(|(path, tmpl)| path_to_sexpr(path).replace("$", tmpl))
            .collect();
        let body = format!(
            "(subtract (, {}) (, {}) )",
            patterns.join(" "),
            templates.join(" ")
        );

        let url = format!("{}/subtract", self.base());
        self.log_post(&url, &body).await;
        let resp = self.client.post(&url).body(body).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(())
    }

    // ─── Explore Operations ─────────────────────────────────────────────────

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

        self.log_get(&url).await;
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(MorkError::BadStatus(resp.status().as_u16()));
        }
        Ok(resp.json().await?)
    }

    pub async fn explore(
        &self,
        path: &PathBuf,
        root: &PathBuf,
        focus_token: &str,
        page_size: usize,
    ) -> Result<ExploreResult, MorkError> {
        let pattern = path_to_sexpr(path);
        let page_size = page_size.max(1);

        let mut subspaces: Vec<(String, PathBuf)> = Vec::new();
        let mut metta_expressions: Vec<String> = Vec::new();
        let mut next_focus_token: Option<String> = None;

        let mut visited_tokens: HashSet<String> = HashSet::new();
        let mut skip_tokens: HashSet<String> = HashSet::new();

        if focus_token.is_empty() {
            let mut subspace_symbols: HashSet<String> = HashSet::new();
            let mut queue: VecDeque<(String, usize, String)> = VecDeque::new(); // (token, depth)

            queue.push_back((String::new(), 0, String::new()));
            visited_tokens.insert(String::new());

            while let Some((current_token, depth, parent_lhs)) = queue.pop_front() {
                let responses = self.explore_raw(&pattern, &current_token).await?;

                let mut all_parent_prefix = true;

                let mut new_subnamespace_symbols: HashSet<String> = HashSet::new();

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            all_parent_prefix = all_parent_prefix
                                && parent_lhs.len() <= lhs.len()
                                && parent_lhs.as_str() <= lhs;
                            new_subnamespace_symbols.insert(lhs.to_string());
                        } else {
                            all_parent_prefix = false;
                            break;
                        }
                    } else {
                        all_parent_prefix = false;
                        break;
                    }
                }

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            subspace_symbols.insert(lhs.to_string());

                            let encoded_token =
                                percent_encode(&response.token, NON_ALPHANUMERIC).to_string();

                            if visited_tokens.insert(encoded_token.clone()) {
                                if lhs != parent_lhs
                                    || (lhs == parent_lhs
                                        && response.cnt > 1
                                        && all_parent_prefix
                                        && new_subnamespace_symbols.len() == responses.len())
                                {
                                    queue.push_back((encoded_token, depth + 1, lhs.to_string()));
                                }
                            }
                        }
                    }
                }
            }

            subspaces = subspace_symbols
                .into_iter()
                .map(|symbol| {
                    let display = format!("({} |$|)", symbol);
                    let subpath = path.join(&symbol);
                    let stripped = subpath
                        .strip_prefix(root)
                        .map(|p| p.to_path_buf())
                        .unwrap_or(subpath);
                    (display, stripped)
                })
                .collect();
        }

        subspaces.sort_by(|a, b| a.0.cmp(&b.0));

        let mut stack: VecDeque<String> = VecDeque::new();

        if focus_token.is_empty() {
            stack.push_back(String::new());
        } else {
            if let Ok(tokens) = serde_json::from_str::<VecDeque<String>>(focus_token) {
                stack = tokens;
            } else {
                stack.push_back(String::new());
            }
        }

        while let Some(current_token) = stack.pop_front() {
            if !skip_tokens.insert(current_token.clone()) {
                continue;
            }

            let mut responses = self.explore_raw(&pattern, &current_token).await?;

            responses.reverse();

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

                    if metta_expressions.len() >= page_size {
                        if !stack.is_empty() {
                            next_focus_token =
                                Some(serde_json::to_string(&stack).unwrap_or_default());
                        }
                        break;
                    }
                } else {
                    if !skip_tokens.contains(&encoded_token) {
                        stack.push_front(encoded_token);
                    }
                }
            }

            if metta_expressions.len() >= page_size {
                break;
            }
        }

        let namespace = path
            .strip_prefix(root)
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|_| path.clone());
        Ok(ExploreResult {
            namespace,
            metta_expressions,
            subspaces,
            focus_token: next_focus_token,
            children: None,
        })
    }

    /// Like `explore`, but recursively visits each subspace up to `depth` levels.
    /// `depth = 1` is equivalent to a plain `explore` call (no recursion).
    pub fn explore_with_depth<'a>(
        &'a self,
        path: &'a PathBuf,
        root: &'a PathBuf,
        focus_token: &'a str,
        depth: u32,
        page_size: usize,
    ) -> Pin<Box<dyn Future<Output = Result<ExploreResult, MorkError>> + Send + 'a>> {
        Box::pin(async move {
            let mut result = self.explore(path, root, focus_token, page_size).await?;
            if depth > 1 {
                let subspaces = result.subspaces.clone();
                let mut children = Vec::new();
                for (_, subspace_rel) in &subspaces {
                    let sub_path = root.join(subspace_rel);
                    match self
                        .explore_with_depth(&sub_path, root, "", depth - 1, page_size)
                        .await
                    {
                        Ok(sub_result) => children.push(sub_result),
                        Err(e) => eprintln!("explore_with_depth: skipping {:?}: {:?}", sub_path, e),
                    }
                }
                if !children.is_empty() {
                    result.children = Some(children);
                }
            }
            Ok(result)
        })
    }

    pub fn explore_namespaces<'a>(
        &'a self,
        path: &'a PathBuf,
        root: &'a PathBuf,
    ) -> Pin<Box<dyn Future<Output = Result<NamespaceInfo, MorkError>> + Send + 'a>> {
        Box::pin(async move {
            let pattern = path_to_sexpr(path);

            let mut subnamespace_symbols: HashSet<String> = HashSet::new();
            let mut visited_tokens: HashSet<String> = HashSet::new();
            let mut queue: VecDeque<(String, usize, String)> = VecDeque::new();

            queue.push_back((String::new(), 0, String::new()));
            visited_tokens.insert(String::new());

            while let Some((current_token, depth, parent_lhs)) = queue.pop_front() {
                let responses = self.explore_raw(&pattern, &current_token).await?;

                let mut all_parent_prefix = true;

                let mut new_subnamespace_symbols: HashSet<String> = HashSet::new();

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            all_parent_prefix = all_parent_prefix
                                && parent_lhs.len() == lhs.len()
                                && parent_lhs.as_str() <= lhs;
                            new_subnamespace_symbols.insert(lhs.to_string());
                        } else {
                            all_parent_prefix = false;
                            break;
                        }
                    } else {
                        all_parent_prefix = false;
                        break;
                    }
                }

                if responses.len() > 0 {
                    // println!("\n\n\n");
                }

                for response in &responses {
                    if let Some(relative_expr) = strip_prefix(&response.expr, path) {
                        if let Some((lhs, _rhs)) = parse_binary_sexp(&relative_expr) {
                            /*
                            println!(
                                "cnt={} relative={} token={:?} lhs={} parent_lhs={}",
                                &response.cnt, relative_expr, &response.token, lhs, &parent_lhs
                            );
                             */

                            subnamespace_symbols.insert(lhs.to_string());

                            let encoded_token =
                                percent_encode(&response.token, NON_ALPHANUMERIC).to_string();

                            if visited_tokens.insert(encoded_token.clone()) {
                                if lhs != parent_lhs
                                    || (lhs == parent_lhs
                                        && response.cnt > 1
                                        && all_parent_prefix
                                        && new_subnamespace_symbols.len() == responses.len())
                                {
                                    queue.push_back((encoded_token, depth + 1, lhs.to_string()));
                                }
                            }
                        }
                    }
                }
            }

            let mut subnamespaces: Vec<NamespaceInfo> = Vec::new();
            for symbol in subnamespace_symbols {
                let subnamespace_path = path.join(&symbol);

                match self.explore_namespaces(&subnamespace_path, root).await {
                    Ok(subnamespace_info) => subnamespaces.push(subnamespace_info),
                    Err(e) => {
                        eprintln!(
                            "Error exploring subnamespace {:?}: {:?}",
                            subnamespace_path, e
                        );
                    }
                }
            }

            let namespace = path
                .strip_prefix(root)
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|_| path.clone());
            Ok(NamespaceInfo {
                namespace,
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

    // ── Path utility tests ──────────────────────────────────────────────────

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
