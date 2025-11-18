use std::path::PathBuf;

use api::mork_api::{Pattern, Template};
use api::rocket;
use api::routes::spaces::Mm2InputMultiWithNamespace;
use httpmock::prelude::*;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

#[path = "common.rs"]
mod common;

#[tokio::test]
#[serial]
async fn test_transform_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    // Setup mock server
    let server = MockServer::start();
    common::setup(&server.base_url());

    // Create test token
    let token = common::create_test_token("/test/", true, true);

    // Mock transform request
    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    // Create client
    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let mm2_input = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/test/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/test/space"))],
    };

    let response = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
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

    let mm2_input = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/other/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/other/space"))],
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
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

    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let mm2_input = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/test/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/test/space"))],
    };

    let response = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
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
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token1 = common::create_test_token("/ns1/", true, true);
    let token2 = common::create_test_token("/ns2/", true, true);

    server.mock(|when, then| {
        when.method(POST).path("/transform");
        then.status(200).body("Transform successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let mm2_input1 = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/ns1/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/ns1/space"))],
    };

    let mm2_input2 = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/ns2/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/ns2/space"))],
    };

    // Transform in ns1
    let response1 = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token1.code.clone()))
        .json(&mm2_input1)
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Transform in ns2
    let response2 = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token2.code.clone()))
        .json(&mm2_input2)
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

    let mm2_input = Mm2InputMultiWithNamespace {
        patterns: vec![Pattern::default()
            .pattern("$x".to_string())
            .namespace(PathBuf::from("/other/space"))],
        templates: vec![Template::default()
            .template("($x)".to_string())
            .namespace(PathBuf::from("/other/space"))],
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/transform")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
