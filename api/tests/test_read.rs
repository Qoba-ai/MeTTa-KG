use api::rocket;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

#[path = "common.rs"]
mod common;
// use crate::common;

#[tokio::test]
#[serial]
async fn test_non_existent_namespace() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    // Setup mock server
    let server = MockServer::start();
    common::setup(&server.base_url());

    // Create test token
    let token = common::create_test_token("/test/", true, true);

    // Mock MORK read response for non-existent namespace
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body(""); // Empty response
    });

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Make request with path not starting with token namespace
    let response = client
        .get("/spaces/other_namespace/some_path")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_existing_empty_namespace() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock empty response
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .get("/spaces/test/some_path")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"\"");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_empty_namespace() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // First, mock upload to initialize data
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    // Then mock read
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("(test data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Upload some data using the client
    let upload_response = client
        .post("/spaces/upload/test/data")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;
    assert_eq!(upload_response.status(), Status::Ok);

    // Now read
    let response = client
        .get("/spaces/test/data")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(test data)\"");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_different_namespaces() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token1 = common::create_test_token("/ns1/", true, true);
    let token2 = common::create_test_token("/ns2/", true, true);

    // Mock different responses for different namespaces
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*ns1.*").unwrap());
        then.status(200).body("(ns1 data)");
    });

    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*ns2.*").unwrap());
        then.status(200).body("(ns2 data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Read from ns1
    let response1 = client
        .get("/spaces/ns1/data")
        .header(Header::new("authorization", token1.code.clone()))
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);
    let body1 = response1.into_string().await.expect("response body");
    assert_eq!(body1, "\"(ns1 data)\"");

    // Read from ns2
    let response2 = client
        .get("/spaces/ns2/data")
        .header(Header::new("authorization", token2.code.clone()))
        .dispatch()
        .await;
    assert_eq!(response2.status(), Status::Ok);
    let body2 = response2.into_string().await.expect("response body");
    assert_eq!(body2, "\"(ns2 data)\"");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_no_read_permission() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", false, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .get("/spaces/test/data")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_namespace_mismatch() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Path does not start with /test/
    let response = client
        .get("/spaces/other/data")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
