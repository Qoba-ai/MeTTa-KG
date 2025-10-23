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

#[derive(Serialize, Deserialize, Clone)]
pub struct TransformDetails {
    /// the sub space as per playground convetions. ie. (/ ...)
    pub patterns: Vec<String>, // A sub space
    pub templates: Vec<String>,
}

impl Default for TransformDetails {
    fn default() -> Self {
        TransformDetails {
            patterns: vec![String::from("$x")],
            templates: vec![String::from("$x")],
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
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

impl Default for Namespace {
    fn default() -> Self {
        Namespace::new()
    }
}

#[allow(dead_code)]
impl TransformDetails {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn patterns(mut self, patterns: Vec<String>) -> Self {
        self.patterns = patterns;
        self
    }

    pub fn templates(mut self, templates: Vec<String>) -> Self {
        self.templates = templates;
        self
    }
}

pub struct MorkApiClient {
    base_url: String,
    client: Client,
}

impl MorkApiClient {
    pub fn new() -> Self {
        let mork_url = env::var("METTA_KG_MORK_URL").expect("METTA_KG_MORK_URL must be set");
        Self {
            base_url: mork_url,
            client: Client::new(),
        }
    }

    pub async fn dispatch<R: Request>(&self, request: R) -> Result<String, Status> {
        let url = format!("{}{}", self.base_url, request.path());
        let mut http_request = self.client.request(request.method(), &url);

        if let Some(body) = request.body() {
            http_request = http_request.json(&body);
        }

        http_request = http_request.timeout(request.timeout());
        match http_request.send().await {
            Ok(resp) => match resp.text().await {
                Ok(text) => Ok(text),
                Err(e) => {
                    eprintln!("Error reading Mork API response text: {}", e);
                    Err(Status::InternalServerError)
                }
            },
            Err(e) => {
                eprintln!("Error sending request to Mork API: {}", e);
                Err(Status::InternalServerError)
            }
        }
    }
}

pub trait Request {
    type Body: Serialize;
    fn method(&self) -> Method;
    fn path(&self) -> String;
    fn body(&self) -> Option<Self::Body> {
        None
    }
    fn timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(20)
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransformRequest {
    transform_input: TransformInput,
}

impl Default for TransformRequest {
    fn default() -> Self {
        TransformRequest {
            transform_input: TransformInput::default(),
        }
    }
}

impl TransformRequest {
    pub fn new() -> Self {
        Default::default()
    }
}

impl TransformSetter for TransformRequest {
    fn transform_input_mut(&mut self) -> &mut TransformInput {
        &mut self.transform_input
    }
}

impl Request for TransformRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::POST
    }

    fn path(&self) -> String {
        format!("/transform/{}/", &self.transform_input.generate_code())
    }

    fn body(&self) -> Option<Self::Body> {
        Some(())
    }
}

pub struct ImportRequest {
    transform_input: TransformInput,
    uri: String,
}

impl Default for ImportRequest {
    fn default() -> Self {
        ImportRequest {
            transform_input: TransformInput::default(),
            uri: String::from(""),
        }
    }
}

impl ImportRequest {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn uri(mut self, uri: String) -> Self {
        self.uri = uri;
        self
    }
}

impl TransformSetter for ImportRequest {
    fn transform_input_mut(&mut self) -> &mut TransformInput {
        &mut self.transform_input
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
            self.transform_input
                .patterns
                .first()
                .unwrap_or(&String::from("&x")),
            self.transform_input
                .templates
                .first()
                .unwrap_or(&String::from("&x")),
            self.uri
        )
    }

    fn body(&self) -> Option<Self::Body> {
        Some(())
    }
}

#[derive(Default)]
#[allow(dead_code)]
pub struct ReadRequest {
    transform_input: TransformInput,
    export_url: Option<String>,
    format: Option<ExportFormat>,
}

impl ReadRequest {
    pub fn new() -> Self {
        Default::default()
    }
}

impl TransformSetter for ReadRequest {
    fn transform_input_mut(&mut self) -> &mut TransformInput {
        &mut self.transform_input
    }
}

impl Request for ReadRequest {
    type Body = ();

    fn method(&self) -> Method {
        Method::GET
    }

    fn path(&self) -> String {
        return if self.transform_input.space.components().count() == 0 {
            format!(
                "/export/{0}/{1}/",
                self.transform_input
                    .patterns
                    .first()
                    .unwrap_or(&String::from("&x")),
                self.transform_input
                    .templates
                    .first()
                    .unwrap_or(&String::from("&x")),
            )
        } else {
            format!(
                "/export/({0} {1})/({0} {2})/",
                self.transform_input.space.to_str().unwrap_or("/"),
                self.transform_input
                    .patterns
                    .first()
                    .unwrap_or(&String::from("&x")),
                self.transform_input
                    .templates
                    .first()
                    .unwrap_or(&String::from("&x")),
            )
        };
    }
}
