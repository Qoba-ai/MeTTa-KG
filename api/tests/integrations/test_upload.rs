use api::rocket;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

use crate::integrations::common;

#[tokio::test]
#[serial]
async fn test_upload_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock upload request
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/upload/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"Upload successful\"");

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

    // Path does not start with /test/
    let response = client
        .post("/spaces/upload/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
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

    // Mock upload request
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/upload/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"Upload successful\"");

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

    // Mock upload request
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/upload/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"Upload successful\"");

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

    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Upload to ns1
    let response1 = client
        .post("/spaces/upload/ns1/space")
        .header(Header::new("authorization", token1.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Upload to ns2
    let response2 = client
        .post("/spaces/upload/ns2/space")
        .header(Header::new("authorization", token2.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;
    assert_eq!(response2.status(), Status::Ok);

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
        .post("/spaces/upload/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .body("(test atom)")
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
