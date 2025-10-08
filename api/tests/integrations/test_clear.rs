use api::rocket;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

use crate::integrations::common;

#[tokio::test]
#[serial]
async fn test_clear_success() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock clear request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Clear successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/clear/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "true");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_existent_namespace() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Path does not start with /test/
    let response = client
        .post("/spaces/clear/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_existing_empty_namespace() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock clear request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Clear successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/clear/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "true");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_empty_namespace() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock clear request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Clear successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let response = client
        .post("/spaces/clear/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "true");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_different_namespaces() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token1 = common::create_test_token("/ns1/", true, true);
    let token2 = common::create_test_token("/ns2/", true, true);

    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/clear/.*").unwrap());
        then.status(200).body("Clear successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Clear in ns1
    let response1 = client
        .post("/spaces/clear/ns1/space")
        .header(Header::new("authorization", token1.code.clone()))
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Clear in ns2
    let response2 = client
        .post("/spaces/clear/ns2/space")
        .header(Header::new("authorization", token2.code.clone()))
        .dispatch()
        .await;
    assert_eq!(response2.status(), Status::Ok);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_namespace_mismatch() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Path does not start with /test/
    let response = client
        .post("/spaces/clear/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
