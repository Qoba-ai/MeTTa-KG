use api::rocket;
use api::routes::spaces::SetOperationInput;
use httpmock::prelude::*;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use rocket::serde::json::serde_json;
use serial_test::serial;

#[path = "common.rs"]
mod common;

#[tokio::test]
#[serial]
async fn test_composition_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    // Setup mock server
    let server = MockServer::start();
    common::setup(&server.base_url());

    // Create test token
    let token = common::create_test_token("/test/", true, true);
    let _ = common::create_test_token("/test/1/", true, false);
    let _ = common::create_test_token("/test/2/", true, false);
    let _ = common::create_test_token("/test/3/", true, false);

    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let body = serde_json::to_string(&SetOperationInput {
        source: vec!["test/1/".to_string(), "test/2/".to_string()],
        target: vec!["test/3/".to_string()],
    })
    .unwrap();

    let response = client
        .post("/spaces/composition")
        .body(body)
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await;
    println!("{:?}", body);
    assert_eq!(body.expect("response body"), "true");
    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_existent_namespace() {
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

    let body = serde_json::to_string(&SetOperationInput {
        source: vec!["other/1/".to_string(), "other/2/".to_string()],
        target: vec!["other/3/".to_string()],
    })
    .unwrap();

    // Path does not start with /test/
    let response = client
        .post("/spaces/composition")
        .body(body)
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
