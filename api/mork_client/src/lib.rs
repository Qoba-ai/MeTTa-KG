use itertools::{Itertools, izip};
use percent_encoding::{NON_ALPHANUMERIC, percent_encode};
use queue::Queue;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::vec;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExploreNodeData {
    pub expr: String,
    pub token: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct Explore {
    client: Arc<Client>,
    pub base_url: String,
    pub path: PathBuf,
    pub pattern: String,
    pub token: String,
    pub data: Option<Vec<ExploreNodeData>>,
    pub parent: Option<ExploreNodeData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct NamespaceInfo {
    namespace: PathBuf,
    token: String,
    subnamespaces: Option<Vec<NamespaceInfo>>,
}

#[derive(PartialEq, Eq)]
pub enum Arity {
    TWO,
    NONTWO,
    ANY,
}

impl Explore {
    pub fn new(
        client: Arc<Client>,
        base_url: String,
        path: PathBuf,
        pattern: String,
        token: String,
        parent: Option<ExploreNodeData>,
    ) -> Self {
        Self {
            client,
            base_url,
            path,
            pattern,
            token,
            data: None,
            parent: parent,
        }
    }

    pub async fn dispatch(&mut self) -> Result<(), reqwest::Error> {
        let pattern_encoded = percent_encode(self.pattern.as_bytes(), NON_ALPHANUMERIC).to_string();
        let url = if self.token.is_empty() {
            format!("{}/explore/{}//", self.base_url, pattern_encoded)
        } else {
            format!(
                "{}/explore/{}/{}/",
                self.base_url, pattern_encoded, self.token
            )
        };
        println!("{}", url);
        let res = self.client.get(&url).send().await?;
        if res.status().is_success() {
            let data = res.json().await?;
            self.data = Some(data);
        }
        Ok(())
    }

    pub fn children(&self, aritytype: Arity) -> Vec<Explore> {
        let mut result: Vec<Explore> = Vec::new();

        if let Some(data) = &self.data {
            for entry in data {
                if let Some(stripped) = strip_prefix(&entry.expr, &self.path) {
                    if aritytype == Arity::ANY
                        || (self.arity(&stripped) != 2 && aritytype == Arity::NONTWO)
                        || (self.arity(&stripped) == 2 && aritytype == Arity::TWO)
                    {
                        let token_encoded =
                            percent_encode(&entry.token, NON_ALPHANUMERIC).to_string();

                        result.push(Explore::new(
                            self.client.clone(),
                            self.base_url.clone(),
                            self.path.clone(),
                            self.pattern.clone(),
                            token_encoded,
                            Some(entry.clone()),
                        ));
                    }
                }
            }
        }
        result
    }

    pub fn values(&self, aritytype: Arity) -> Vec<String> {
        let mut result: Vec<String> = Vec::new();

        if let Some(data) = &self.data {
            for entry in data {
                if let Some(stripped) = strip_prefix(&entry.expr, &self.path) {
                    if aritytype == Arity::ANY
                        || (self.arity(&stripped) != 2 && aritytype == Arity::NONTWO)
                        || (self.arity(&stripped) == 2 && aritytype == Arity::TWO)
                    {
                        result.push(entry.expr.clone());
                    }
                }
            }
        }

        result
    }

    pub fn tokens(&self, aritytype: Arity) -> Vec<String> {
        let mut result: Vec<String> = Vec::new();

        if let Some(data) = &self.data {
            for entry in data {
                if let Some(stripped) = strip_prefix(&entry.expr, &self.path) {
                    if aritytype == Arity::ANY
                        || (self.arity(&stripped) != 2 && aritytype == Arity::NONTWO)
                        || (self.arity(&stripped) == 2 && aritytype == Arity::TWO)
                    {
                        let encoded = percent_encode(&entry.token, NON_ALPHANUMERIC).to_string();

                        result.push(encoded);
                    }
                }
            }
        }

        result
    }

    pub fn arity(&self, expr: &String) -> usize {
        let trimmed = expr.trim();

        // Check if it's an S-expression (must have outer parentheses)
        if !trimmed.starts_with('(') || !trimmed.ends_with(')') {
            return 0;
        }

        // Remove outer parentheses
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
    /// Token namespace without leading slash, e.g. `"space/sub"` or `""` for root.
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

    /// Returns an error if `path` is not under this token's namespace.
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

pub fn n_ary_pattern(n: usize) -> String {
    let mut result = String::new();

    result.push('(');

    for i in 0..n {
        result.push_str(format!("${} ", i).as_str());
    }

    result.push(')');

    result
}

pub fn is_balanced(s: &str) -> bool {
    let mut depth = 0;
    for c in s.chars() {
        if c == '(' {
            depth += 1;
        } else if c == ')' {
            depth -= 1;
            if depth < 0 {
                return false;
            }
        }
    }
    depth == 0
}

pub fn parse_binary_sexp(input: &str) -> Option<(&str, &str)> {
    let inner = input.strip_prefix('(')?.strip_suffix(')')?;

    let (lhs, rhs) = inner.split_once(' ')?;

    if lhs.contains('(') || lhs.contains(')') {
        return None;
    }

    if is_balanced(rhs) {
        Some((lhs, rhs.trim()))
    } else {
        None
    }
}

pub fn strip_prefix(input: &str, path: &Path) -> Option<String> {
    let mut inner = input;

    for component in path.components() {
        inner = inner.strip_prefix('(')?.strip_suffix(')')?.trim();

        if let Some(s) = component.as_os_str().to_str() {
            inner = inner.strip_prefix(s)?.trim();
        }
    }

    Some(String::from(inner.trim()))
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
        Self {
            client: Arc::new(Client::new()),
            base_url: base_url.into(),
        }
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
    pub async fn copy(
        &self,
        perm: &Permission,
        src_path: &Path,
        dst_path: &Path,
    ) -> Result<(), MorkError> {
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

    /// Wait for a space lock. Requires write if `is_writer`, read otherwise.
    pub async fn busywait(
        &self,
        perm: &Permission,
        path: &Path,
        millis: u64,
        is_writer: bool,
    ) -> Result<String, MorkError> {
        perm.check_namespace(path)?;
        if is_writer {
            perm.require_write()?
        } else {
            perm.require_read()?
        };

        let pattern = path_to_sexpr(path);
        let mut url = format!(
            "{}/busywait/{}/?expr1={}",
            self.base(),
            millis,
            Self::enc(&pattern),
        );
        if is_writer {
            url.push_str("&writer1");
        }
        let resp = self.client.get(&url).send().await?;
        Ok(resp.text().await?)
    }

    /// Poll the status of a space operation. Requires read.
    pub async fn status(
        &self,
        perm: &Permission,
        path: &Path,
    ) -> Result<serde_json::Value, MorkError> {
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

    pub async fn explore(
        &self,
        perm: &Permission,
        path: &PathBuf,
        focus_token: &String,
    ) -> Result<Vec<(String, Option<String>)>, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        let mut result: Vec<(String, Option<String>)> = vec![];

        let pattern = String::from("$");

        let mut queue = Queue::<Explore>::new();
        let mut visited_tokens = std::collections::HashSet::new();

        if !focus_token.is_empty() {
            visited_tokens.insert(focus_token.clone());
        }

        let mut explore = Explore::new(
            self.client.clone(),
            self.base_url.clone(),
            path.clone(),
            pattern.clone(),
            focus_token.clone(),
            None,
        );

        explore.dispatch().await?;

        let children = explore.children(Arity::ANY);

        for c2 in children {
            if visited_tokens.insert(c2.token.clone()) {
                queue.queue(c2).expect("FAILED TO QUEUE");
            }
        }

        while let Some(mut e) = queue.dequeue() {
            e.dispatch().await?;

            let nr_children = e.children(Arity::ANY).len();

            if nr_children == 0 || nr_children == 1 {
                if let Some(parent) = e.parent {
                    result.push((parent.expr, None));

                    // if let Some(stripped) = strip_prefix(v.as_str(), &path) {
                    //    result.push((parent.expr, None));
                    // }
                }

                continue;
            }

            let nary_children = e.children(Arity::NONTWO);

            for c in nary_children {
                if visited_tokens.insert(c.token.clone()) {
                    queue.queue(c.clone()).expect("FAILED TO QUEUE");
                }
            }

            let binary_values = e.values(Arity::TWO);
            let binary_tokens = e.tokens(Arity::TWO);

            for (v, t) in izip!(binary_values, binary_tokens) {
                if let Some(stripped) = strip_prefix(v.as_str(), &path) {
                    println!("{} {}", v, stripped);
                    if let Some((lhs, rhs)) = parse_binary_sexp(&stripped.as_str()) {
                        let replaced = v.replace(
                            format!("({} {})", lhs, rhs).as_str(),
                            format!("({} |$|)", lhs).as_str(),
                        );

                        result.push((replaced, Some(t)));
                    }
                }
            }
        }

        Ok(result)
    }

    pub async fn explore_namespaces(
        &self,
        perm: &Permission,
        path: &PathBuf,
    ) -> Result<NamespaceInfo, MorkError> {
        perm.require_read()?;
        perm.check_namespace(path)?;

        self.explore_namespaces_helper(path).await
    }

    pub async fn explore_namespaces_helper(
        &self,
        path: &PathBuf,
    ) -> Result<NamespaceInfo, MorkError> {
        let mut result: Vec<NamespaceInfo> = vec![];

        let mut q = Queue::new();

        q.queue(Explore::new(
            self.client.clone(),
            self.base_url.clone(),
            PathBuf::new(),
            String::from("$"),
            String::new(),
            None,
        ))
        .expect("FAILED TO QUEUE");

        for i in 0..path.components().count() * 2 + 1 {
            let mut new = Queue::new();

            while let Some(mut explore) = q.dequeue() {
                explore.dispatch().await?;

                let children = explore.children(Arity::TWO);

                println!("{:#?}", explore.data);

                for c in children {
                    new.queue(c).expect("FAILED TO QUEUE");
                }
            }

            println!("NEW LENGTH: {:?}", new.len());

            q = new.clone();
        }

        println!("\nQ LENGTH: {:?}", q.len());
        println!("Q: {:#?}\n", q);

        let token = if let Some(mut explore) = q.dequeue() {
            explore.dispatch().await?;

            let tokens = explore.tokens(Arity::TWO);
            let values: Vec<String> = explore.values(Arity::TWO);

            for (t, v) in izip!(tokens, values) {
                if let Some(stripped) = strip_prefix(v.as_str(), &path) {
                    if let Some((lhs, rhs)) = parse_binary_sexp(&stripped.as_str()) {
                        result.push(NamespaceInfo {
                            namespace: path.join(lhs),
                            token: t,
                            subnamespaces: None,
                        });
                    }
                }
            }

            explore.token.clone()
        } else {
            String::new()
        };

        /*
        let focus_token = explore
            .tokens(Arity::TWO)
            .into_iter()
            .next()
            .unwrap_or(String::new());

        let mut result: Vec<NamespaceInfo> = vec![];

        let mut explore = Explore::new(
            self.client.clone(),
            self.base_url.clone(),
            path.clone(),
            String::from("$"),
            focus_token.clone(),
            None,
        );

        explore.dispatch().await?;

        let children = explore.children(Arity::TWO);

        let tokens = explore.tokens(Arity::TWO);
        let values: Vec<String> = explore.values(Arity::TWO);

        for (t, v) in izip!(tokens, values) {
            if let Some(stripped) = strip_prefix(v.as_str(), &path) {
                if let Some((lhs, rhs)) = parse_binary_sexp(&stripped.as_str()) {
                    result.push(NamespaceInfo {
                        namespace: path.join(lhs),
                        token: t,
                        subnamespaces: None,
                    });
                }
            }
        }
         */

        Ok(NamespaceInfo {
            namespace: path.clone(),
            token: token,
            subnamespaces: Some(result),
        })
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

    fn read_only(ns: &str) -> Permission {
        Permission::new(ns, true, false)
    }
    fn write_only(ns: &str) -> Permission {
        Permission::new(ns, false, true)
    }
    fn read_write(ns: &str) -> Permission {
        Permission::new(ns, true, true)
    }

    // ── import ───────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn import_requires_write() {
        let err = client()
            .import(&read_only(""), Path::new("space/sub"), "http://x/f.metta")
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
                "http://x/f.metta",
            )
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    // ── export ───────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn export_requires_read() {
        let err = client()
            .export(&write_only(""), Path::new("space/sub"))
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
            .export(&read_write("other"), Path::new("space/sub"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    // ── clear ────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn clear_requires_write() {
        let err = client()
            .clear(&read_only(""), Path::new("space/sub"))
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
            .clear(&read_write("other"), Path::new("space/sub"))
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            MorkError::Permission(PermissionError::NamespaceMismatch { .. })
        ));
    }

    // ── copy ─────────────────────────────────────────────────────────────────

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

    // ── transform ────────────────────────────────────────────────────────────

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

    // ── busywait ─────────────────────────────────────────────────────────────

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

    // ── status ───────────────────────────────────────────────────────────────

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

    // ── count ────────────────────────────────────────────────────────────────

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
