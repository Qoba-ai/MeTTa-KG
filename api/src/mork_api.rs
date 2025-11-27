use reqwest::{Client, Method};
use rocket::http::Status;
use serde::{Deserialize, Serialize};
use std::any::Any;
use std::env;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
#[allow(dead_code)]
pub enum ExportFormat {
    Metta,
    Json,
    Csv,
    Raw,
}

/// Represents a pattern or a template with a namespace
///
/// # Examples
///
/// ```
/// use api::mork_api::Mm2Cell;
/// use api::mork_api::Namespace;
///
/// let ns = Namespace::from_path_string("/parent/child/grandchild");
/// let pattern = Mm2Cell::new_pattern("$x".to_string(), ns);
/// ```
///
/// will be represented as
///
/// ```lisp
/// (parent (child (grandchild (grandchilda727d4f9-836a-4e4c-9480 $x))))
/// ```
///
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind")]
pub enum Mm2Cell {
    #[serde(rename = "pattern")]
    Pattern(Mm2CellValue),
    #[serde(rename = "template")]
    Template(Mm2CellValue),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Mm2CellValue {
    pub value: String,
    pub namespace: Namespace,
}

impl Default for Mm2Cell {
    fn default() -> Self {
        Mm2Cell::Pattern(Mm2CellValue {
            value: "$x".to_string(),
            namespace: Namespace::default(),
        })
    }
}

impl Mm2Cell {
    pub fn new_pattern(value: String, namespace: Namespace) -> Self {
        Mm2Cell::Pattern(Mm2CellValue { value, namespace })
    }

    pub fn new_template(value: String, namespace: Namespace) -> Self {
        Mm2Cell::Template(Mm2CellValue { value, namespace })
    }

    pub fn value(&self) -> &str {
        match self {
            Mm2Cell::Pattern(p) | Mm2Cell::Template(p) => &p.value,
        }
    }

    pub fn namespace(&self) -> &Namespace {
        match self {
            Mm2Cell::Pattern(p) | Mm2Cell::Template(p) => &p.namespace,
        }
    }

    pub fn build(&self) -> String {
        self.namespace().with_namespace(self.value())
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TransformDetails {
    /// the sub space as per playground convetions. ie. (/ ...)
    pub patterns: Vec<Mm2Cell>, // A sub space
    pub templates: Vec<Mm2Cell>,
}

impl Default for TransformDetails {
    fn default() -> Self {
        TransformDetails {
            patterns: vec![Mm2Cell::default()],
            templates: vec![Mm2Cell::Template(Mm2CellValue {
                value: "$x".to_string(),
                namespace: Namespace::default(),
            })],
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(transparent)]
pub struct Namespace {
    path: Vec<String>,
}

impl Namespace {
    pub fn new() -> Self {
        Namespace { path: vec![] }
    }

    pub fn from_path_string(path_str: &str) -> Self {
        let components: Vec<String> = path_str
            .split('/')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        Namespace { path: components }
    }

    fn current_name(&self) -> String {
        self.path
            .last()
            .cloned()
            .unwrap_or_else(|| "root".to_string())
    }

    fn data_tag(&self) -> String {
        format!("{}a727d4f9-836a-4e4c-9480", self.current_name())
    }

    pub fn with_namespace(&self, value: &str) -> String {
        let mut result = value.to_string();

        result = format!("({} {})", self.data_tag(), result);

        for name in self.path.iter().rev() {
            result = format!("({name} {result})");
        }

        result
    }
}

impl From<PathBuf> for Namespace {
    fn from(path: PathBuf) -> Self {
        Namespace::from_path_string(&path.to_string_lossy())
    }
}

impl std::fmt::Display for Namespace {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            self.path
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<String>>()
                .join("/")
        )
    }
}

#[allow(dead_code)]
impl TransformDetails {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn patterns(mut self, patterns: Vec<Mm2Cell>) -> Self {
        self.patterns = patterns;
        self
    }

    pub fn templates(mut self, templates: Vec<Mm2Cell>) -> Self {
        self.templates = templates;
        self
    }
}

pub struct MorkApiClient {
    base_url: String,
    client: Client,
}

impl Default for MorkApiClient {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8001".to_string(), // According to Dockerfile.mork
            client: Client::new(),
        }
    }
}

impl MorkApiClient {
    pub fn new() -> Self {
        if let Ok(mork_url) = env::var("METTA_KG_MORK_URL") {
            Self {
                base_url: mork_url,
                client: Client::new(),
            }
        } else {
            Self::default()
        }
    }

    pub async fn dispatch<R: Request>(&self, request: R) -> Result<String, Status> {
        let url = format!("{}{}", self.base_url, request.path());
        let mut http_request = self.client.request(request.method(), &url);

        if request.path().starts_with("/upload/") || request.path() == "/transform" {
            if let Some(body) = request.body() {
                if let Some(body_str) = (&body as &dyn Any).downcast_ref::<String>() {
                    http_request = http_request
                        .header("Content-Type", "text/plain")
                        .body(body_str.clone());
                } else {
                    eprintln!("Upload endpoint called with non-string body type");
                    return Err(Status::InternalServerError);
                }
            }
        } else if let Some(body) = request.body() {
            http_request = http_request.json(&body);
        }

        http_request = http_request.timeout(request.timeout());
        match http_request.send().await {
            Ok(resp) => match resp.text().await {
                Ok(text) => Ok(text),
                Err(e) => {
                    eprintln!("Error reading Mork API response text: {e}");
                    Err(Status::InternalServerError)
                }
            },
            Err(e) => {
                eprintln!("Error sending request to Mork API: {e}");
                Err(Status::InternalServerError)
            }
        }
    }
}

pub trait Request {
    type Body: Serialize + Any;
    fn method(&self) -> Method;
    fn path(&self) -> String;
    fn body(&self) -> Option<Self::Body> {
        None
    }
    fn timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(20)
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct TransformRequest {
    namespace: Namespace,
    transform_input: TransformDetails,
}

impl TransformRequest {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = Namespace::from(ns);
        self
    }

    pub fn transform_input(mut self, inp: TransformDetails) -> Self {
        self.transform_input = inp;
        self
    }

    fn multi_patterns(&self) -> String {
        format!(
            "(, {})",
            self.transform_input
                .patterns
                .iter()
                .map(|pattern| { pattern.build() })
                .collect::<Vec<String>>()
                .join(" ")
        )
    }

    fn multi_templates(&self) -> String {
        format!(
            "(, {})",
            self.transform_input
                .templates
                .iter()
                .map(|template| { template.build() })
                .collect::<Vec<String>>()
                .join(" ")
        )
    }

    pub fn transform_code(&self) -> String {
        format!(
            "(transform {} {})",
            self.multi_patterns(),
            self.multi_templates()
        )
    }
}

impl Request for TransformRequest {
    type Body = String;

    fn method(&self) -> Method {
        Method::POST
    }

    fn path(&self) -> String {
        "/transform".to_string()
    }

    fn body(&self) -> Option<Self::Body> {
        Some(self.transform_code())
    }
}

#[derive(Default)]
pub struct ImportRequest {
    namespace: PathBuf,
    transform_input: TransformDetails,
    uri: String,
}

impl ImportRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = ns;
        self
    }

    pub fn uri(mut self, uri: String) -> Self {
        self.uri = uri;
        self
    }

    /// Set the import structure, pattern is always `$x` and template is also
    /// `$x` by default which can be overridden
    pub fn to(mut self, template: Mm2Cell) -> Self {
        self.transform_input = TransformDetails::new()
            .patterns(vec![Mm2Cell::default()])
            .templates(vec![template]);
        self
    }
}

impl Request for ImportRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        format!(
            "/import/{}/{}/?uri={}",
            urlencoding::encode("$x"),
            urlencoding::encode(
                &self
                    .transform_input
                    .templates
                    .first()
                    .cloned()
                    .unwrap_or_default()
                    .build()
            ),
            self.uri
        )
    }

    fn body(&self) -> Option<Self::Body> {
        None
    }
}

#[derive(Default)]
#[allow(dead_code)]
pub struct ReadRequest {
    namespace: Namespace,
    transform_input: TransformDetails,
    export_url: Option<String>,
    format: Option<ExportFormat>,
}

impl ReadRequest {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn transform_input(mut self, inp: TransformDetails) -> Self {
        self.transform_input = inp;
        self
    }
}

impl Request for ReadRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        let path = format!(
            "/export/{}/{}",
            urlencoding::encode(
                &self
                    .transform_input
                    .patterns
                    .first()
                    .cloned()
                    .unwrap_or_default()
                    .build()
            ),
            urlencoding::encode(
                &self
                    .transform_input
                    .templates
                    .first()
                    .cloned()
                    .unwrap_or_default()
                    .build()
            )
        );
        path
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ExploreRequest {
    namespace: Namespace,
    pattern: String,
    token: String,
}

impl ExploreRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = Namespace::from(ns);
        self
    }

    pub fn pattern(mut self, pattern: String) -> Self {
        self.pattern = pattern;
        self
    }

    pub fn token(mut self, token: String) -> Self {
        self.token = token;
        self
    }
}

impl Request for ExploreRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        format!(
            "/explore/{}/{}/",
            urlencoding::encode(&self.namespace.with_namespace(&self.pattern)),
            self.token
        )
    }
}

#[derive(Default)]
pub struct UploadRequest {
    namespace: Namespace,
    pattern: String,
    template: String,
    data: String,
}

impl UploadRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = Namespace::from(ns);
        self
    }

    pub fn pattern(mut self, pattern: String) -> Self {
        self.pattern = pattern;
        self
    }

    pub fn template(mut self, template: String) -> Self {
        self.template = template;
        self
    }

    pub fn data(mut self, data: String) -> Self {
        self.data = data;
        self
    }
}

impl Request for UploadRequest {
    type Body = String;

    fn method(&self) -> Method {
        Method::POST
    }

    fn path(&self) -> String {
        format!(
            "/upload/{}/{}",
            urlencoding::encode(&self.pattern),
            urlencoding::encode(&self.namespace.with_namespace(&self.template))
        )
    }
    fn body(&self) -> Option<Self::Body> {
        Some(self.data.clone())
    }
}

#[derive(Default)]
pub struct ExportRequest {
    namespace: Namespace,
    pattern: String,
    template: String,
    format: Option<ExportFormat>,
    max_write: Option<usize>,
}

impl ExportRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = Namespace::from(ns);
        self
    }

    pub fn pattern(mut self, pattern: String) -> Self {
        self.pattern = pattern;
        self
    }

    pub fn template(mut self, template: String) -> Self {
        self.template = template;
        self
    }

    pub fn format(mut self, format: ExportFormat) -> Self {
        self.format = Some(format);
        self
    }
}

impl Request for ExportRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        let mut path = format!(
            "/export/{}/{}",
            urlencoding::encode(&self.namespace.with_namespace(&self.pattern)),
            urlencoding::encode(&self.template)
        );

        let mut query_params = Vec::new();

        if let Some(format) = &self.format {
            let format_str = match format {
                ExportFormat::Metta => "metta",
                ExportFormat::Json => "json",
                ExportFormat::Csv => "csv",
                ExportFormat::Raw => "raw",
            };
            query_params.push(format!("format={format_str}"));
        }

        if let Some(max_write) = self.max_write {
            query_params.push(format!("max_write={max_write}"));
        }

        if !query_params.is_empty() {
            path.push_str("/?");
            path.push_str(&query_params.join("&"));
        }

        path
    }

    fn body(&self) -> Option<Self::Body> {
        None
    }
}

#[derive(Default)]
pub struct ClearRequest {
    namespace: Namespace,
    expr: String,
}

impl ClearRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn namespace(mut self, ns: PathBuf) -> Self {
        self.namespace = Namespace::from(ns);
        self
    }

    pub fn expr(mut self, expr: String) -> Self {
        self.expr = expr;
        self
    }
}

impl Request for ClearRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        let expr_to_use = self.namespace.with_namespace(&self.expr);

        format!("/clear/{}", urlencoding::encode(&expr_to_use))
    }

    fn body(&self) -> Option<Self::Body> {
        None
    }
}

#[cfg(test)]
mod tests {
    use crate::mork_api::Namespace;

    #[test]
    fn test_namespace() {
        let ns = Namespace::from_path_string("/parent/child/grandchild");
        assert_eq!(
            ns.path,
            vec![
                "parent".to_string(),
                "child".to_string(),
                "grandchild".to_string()
            ]
        );
        assert_eq!(ns.current_name(), "grandchild".to_string());
        assert_eq!(ns.data_tag(), "grandchilda727d4f9-836a-4e4c-9480");
    }

    #[test]
    fn test_with_namespace() {
        let ns = Namespace::from_path_string("/parent/child/grandchild");
        let expected = "(parent (child (grandchild (grandchilda727d4f9-836a-4e4c-9480 $x))))";

        assert_eq!(ns.with_namespace("$x"), expected);
    }
}
