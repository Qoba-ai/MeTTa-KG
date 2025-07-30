use reqwest::{Client, Method};
use rocket::http::Status;
use serde::{Deserialize, Serialize};
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

pub trait TransformSetter: Sized {
    fn transform_input_mut(&mut self) -> &mut TransformInput;

    fn pattern(mut self, pattern: impl Into<String>) -> Self {
        self.transform_input_mut().pattern = pattern.into();
        self
    }

    fn template(mut self, template: impl Into<String>) -> Self {
        self.transform_input_mut().template = template.into();
        self
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransformInput {
    pub pattern: String,
    pub template: String,
}

impl Default for TransformInput {
    fn default() -> Self {
        TransformInput {
            pattern: String::from("$x"),
            template: String::from("$x"),
        }
    }
}

#[allow(dead_code)]
impl TransformInput {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn pattern(mut self, pattern: String) -> Self {
        self.pattern = pattern;
        self
    }

    pub fn template(mut self, template: String) -> Self {
        self.template = template;
        self
    }

    pub fn generate_code(&self) -> String {
        format!("transform(,{0})(,{1})", self.pattern, self.template)
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
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransformRequest {
    input_space: PathBuf,
    output_space: PathBuf,
    transform_input: TransformInput,
}

impl Default for TransformRequest {
    fn default() -> Self {
        TransformRequest {
            input_space: PathBuf::from("/"),
            output_space: PathBuf::from("/"),
            transform_input: TransformInput::default(),
        }
    }
}

impl TransformRequest {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn input_space(mut self, input_space: PathBuf) -> Self {
        self.input_space = input_space;
        self
    }

    pub fn output_space(mut self, output_space: PathBuf) -> Self {
        self.output_space = output_space;
        self
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
        format!("/transform/{}/", self.transform_input.generate_code())
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
        Method::POST
    }

    fn path(&self) -> String {
        format!(
            "/import/{}/{}?uri={}",
            self.transform_input.pattern, self.transform_input.template, self.uri
        )
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
        format!(
            "/export/{}/{}",
            self.transform_input.pattern, self.transform_input.template
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    #[tokio::test]
    async fn test_transform_request() {
        let server = MockServer::start();

        let mock = server.mock(|when, then| {
            when.method(POST).path("/transform/transform(,$x)(,$x)/");
            then.status(200).body("transform success");
        });

        let client = MorkApiClient {
            base_url: server.base_url(),
            client: Client::new(),
        };

        let request = TransformRequest::new();

        let result = client.dispatch(request).await.unwrap();

        mock.assert();
        assert_eq!(result, "transform success");
    }

    #[tokio::test]
    async fn test_import_request() {
        let server = MockServer::start();

        let mock = server.mock(|when, then| {
            when.method(POST)
                .path("/import/$x/$x")
                .query_param("uri", "http://example.com");
            then.status(200).body("import success");
        });

        let client = MorkApiClient {
            base_url: server.base_url(),
            client: Client::new(),
        };

        let request = ImportRequest::new().uri("http://example.com".to_string());

        let result = client.dispatch(request).await.unwrap();

        mock.assert();
        assert_eq!(result, "import success");
    }

    #[tokio::test]
    async fn test_read_request() {
        let server = MockServer::start();

        let mock = server.mock(|when, then| {
            when.method(GET).path("/export/$x/$x");
            then.status(200).body("read success");
        });

        let client = MorkApiClient {
            base_url: server.base_url(),
            client: Client::new(),
        };

        let request = ReadRequest::new();

        let result = client.dispatch(request).await.unwrap();

        mock.assert();
        assert_eq!(result, "read success");
    }
}
