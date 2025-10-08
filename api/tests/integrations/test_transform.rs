use api::rocket;
use httpmock::prelude::*;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

use crate::integrations::common;
use api::routes::spaces::Mm2InputMulti;

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

    let mm2_input = Mm2InputMulti {
        patterns: vec!["$x".to_string()],
        templates: vec!["($x)".to_string()],
    };

    let response = client
        .post("/spaces/transform/test/space")
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

    let mm2_input = Mm2InputMulti {
        patterns: vec!["$x".to_string()],
        templates: vec!["($x)".to_string()],
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/transform/other/space")
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

    let mm2_input = Mm2InputMulti {
        patterns: vec!["$x".to_string()],
        templates: vec!["($x)".to_string()],
    };

    let response = client
        .post("/spaces/transform/test/space")
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

    let mm2_input = Mm2InputMulti {
        patterns: vec!["$x".to_string()],
        templates: vec!["($x)".to_string()],
    };

    // Transform in ns1
    let response1 = client
        .post("/spaces/transform/ns1/space")
        .header(Header::new("authorization", token1.code.clone()))
        .json(&mm2_input)
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Transform in ns2
    let response2 = client
        .post("/spaces/transform/ns2/space")
        .header(Header::new("authorization", token2.code.clone()))
        .json(&mm2_input)
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

    let mm2_input = Mm2InputMulti {
        patterns: vec!["$x".to_string()],
        templates: vec!["($x)".to_string()],
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/transform/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&mm2_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
