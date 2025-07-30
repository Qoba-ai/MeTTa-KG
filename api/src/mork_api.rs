use reqwest::{Client, Method};
use rocket::http::Status;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::PathBuf;
use urlencoding::{decode, encode};

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

    #[allow(dead_code)]
    fn add_pattern(mut self, pattern: String) -> Self {
        self.transform_input_mut().patterns.push(pattern);
        self
    }

    #[allow(dead_code)]
    fn add_template(mut self, template: String) -> Self {
        self.transform_input_mut().templates.push(template);
        self
    }

    fn patterns(mut self, patterns: Vec<String>) -> Self {
        self.transform_input_mut().patterns = patterns;
        self
    }

    fn templates(mut self, templates: Vec<String>) -> Self {
        self.transform_input_mut().templates = templates;
        self
    }

    fn space(mut self, space: PathBuf) -> Self {
        self.transform_input_mut().space = space;
        self
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransformInput {
    pub space: PathBuf,
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

impl Default for TransformInput {
    fn default() -> Self {
        TransformInput {
            space: PathBuf::from("/"),
            patterns: vec![String::from("$x")],
            templates: vec![String::from("$x")],
        }
    }
}

#[allow(dead_code)]
impl TransformInput {
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

    pub fn space(mut self, space: PathBuf) -> Self {
        self.space = space;
        self
    }

    pub fn generate_code(&self) -> String {
        let space_str = self.space.to_str().unwrap_or_default();
        format!(
            "(transform {0} {1})",
            self.patterns_to_str(),
            self.templates_to_str()
        )
    }

    fn patterns_to_str(&self) -> String {
        self.multi_input_to_str(&self.patterns)
    }

    fn templates_to_str(&self) -> String {
        self.multi_input_to_str(&self.templates)
    }

    // converts a Vec<String> to a String with format "(, (0) (1) (2))"
    fn multi_input_to_str(&self, inp: &Vec<String>) -> String {
        format!(
            "(, {})",
            inp.iter()
                .map(|i| format!("({} ({}))", self.space.to_str().unwrap_or("/"), i))
                .collect::<Vec<String>>()
                .join(" ")
        )
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
        Method::POST
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
        format!(
            "/export/{}/{}/",
            self.transform_input
                .patterns
                .first()
                .unwrap_or(&String::from("&x")),
            self.transform_input
                .templates
                .first()
                .unwrap_or(&String::from("&x")),

        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;
    //
    //#[tokio::test]
    //async fn test_transform_request() {
    //    let server = MockServer::start();
    //
    //    let mock = server.mock(|when, then| {
    //        when.method(POST)
    //            .path("/transform/(transform (, (/ (&x))) (, (/ (&x))))/");
    //        then.status(200).body("transform success");
    //    });
    //
    //    let client = MorkApiClient {
    //        base_url: server.base_url(),
    //        client: Client::new(),
    //    };
    //
    //    let request = TransformRequest::new();
    //
    //    let result = client.dispatch(request).await.unwrap();
    //
    //    mock.assert();
    //    assert_eq!(result, "transform success");
    //}
    //
    //#[tokio::test]
    //async fn test_import_request() {
    //    let server = MockServer::start();
    //
    //    let mock = server.mock(|when, then| {
    //        when.method(POST)
    //            .path("/import/$x/$x")
    //            .query_param("uri", "http://example.com");
    //        then.status(200).body("import success");
    //    });
    //
    //    let client = MorkApiClient {
    //        base_url: server.base_url(),
    //        client: Client::new(),
    //    };
    //
    //    let request = ImportRequest::new().uri("http://example.com".to_string());
    //
    //    let result = client.dispatch(request).await.unwrap();
    //
    //    mock.assert();
    //    assert_eq!(result, "import success");
    //}
    //
    //#[tokio::test]
    //async fn test_read_request() {
    //    let server = MockServer::start();
    //
    //    let mock = server.mock(|when, then| {
    //        when.method(GET).path("/export/$x/$x");
    //        then.status(200).body("read success");
    //    });
    //
    //    let client = MorkApiClient {
    //        base_url: server.base_url(),
    //        client: Client::new(),
    //    };
    //
    //    let request = ReadRequest::new();
    //
    //    let result = client.dispatch(request).await.unwrap();
    //
    //    mock.assert();
    //    assert_eq!(result, "read success");
    //}

    #[test]
    fn test_transform_input_new() {
        let transform_input = TransformInput::new();
        assert_eq!(transform_input.space, PathBuf::from("/"));
        assert_eq!(transform_input.patterns, vec![String::from("$x")]);
        assert_eq!(transform_input.templates, vec![String::from("$x")]);
    }

    #[test]
    fn test_transform_input_patterns() {
        let transform_input =
            TransformInput::new().patterns(vec![String::from("foo"), String::from("bar")]);
        assert_eq!(
            transform_input.patterns,
            vec![String::from("foo"), String::from("bar")]
        );
    }

    #[test]
    fn test_transform_input_templates() {
        let transform_input =
            TransformInput::new().templates(vec![String::from("baz"), String::from("qux")]);
        assert_eq!(
            transform_input.templates,
            vec![String::from("baz"), String::from("qux")]
        );
    }

    #[test]
    fn test_transform_input_multi_input_to_str() {
        let transform_input = TransformInput::new();
        let input = vec![String::from("foo"), String::from("bar")];
        assert_eq!(
            transform_input.multi_input_to_str(&input),
            "(, (/ (foo)) (/ (bar)))"
        );
    }

    #[test]
    fn test_transform_input_multi_input_to_str_with_space() {
        let transform_input = TransformInput::new().space(PathBuf::from("/foo/bar/"));
        let input = vec![String::from("foo"), String::from("bar")];

        assert_eq!(
            transform_input.multi_input_to_str(&input),
            "(, (/foo/bar/ (foo)) (/foo/bar/ (bar)))"
        );
    }

    #[test]
    fn test_transform_input_patterns_to_str() {
        let transform_input =
            TransformInput::new().patterns(vec![String::from("foo"), String::from("bar")]);
        assert_eq!(transform_input.patterns_to_str(), "(, (/ (foo)) (/ (bar)))");
    }

    #[test]
    fn test_transform_input_templates_to_str() {
        let transform_input =
            TransformInput::new().templates(vec![String::from("baz"), String::from("qux")]);
        assert_eq!(
            transform_input.templates_to_str(),
            "(, (/ (baz)) (/ (qux)))"
        );
    }

    #[test]
    fn test_transform_input_generate_code() {
        let transform_input = TransformInput::new()
            .patterns(vec![String::from("foo")])
            .templates(vec![String::from("bar")]);
        assert_eq!(
            transform_input.generate_code().as_str(),
            "(transform (, (/ (foo))) (, (/ (bar))))"
        );

        let transform_input_multi = TransformInput::new()
            .patterns(vec![String::from("foo"), String::from("baz")])
            .templates(vec![String::from("bar"), String::from("qux")]);
        assert_eq!(
            transform_input_multi.generate_code(),
            "(transform (, (/ (foo)) (/ (baz))) (, (/ (bar)) (/ (qux))))"
        );
    }
}
