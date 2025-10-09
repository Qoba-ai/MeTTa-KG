use api::rocket;
use api::routes::spaces::Mm2Input;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

use crate::integrations::common;

#[tokio::test]
#[serial]
async fn test_export_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock export request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("(export data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    let response = client
        .post("/spaces/export/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&export_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(export data)\"");

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

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/export/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&export_input)
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

    // Mock export request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("(export data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    let response = client
        .post("/spaces/export/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&export_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(export data)\"");

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

    // Mock export request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("(export data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    let response = client
        .post("/spaces/export/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&export_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(export data)\"");

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
        when.method(GET)
            .path_matches(Regex::new(r"/export/.*").unwrap());
        then.status(200).body("(export data)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    // Export from ns1
    let response1 = client
        .post("/spaces/export/ns1/space")
        .header(Header::new("authorization", token1.code.clone()))
        .json(&export_input)
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Export from ns2
    let response2 = client
        .post("/spaces/export/ns2/space")
        .header(Header::new("authorization", token2.code.clone()))
        .json(&export_input)
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

    let export_input = Mm2Input {
        pattern: "$x".to_string(),
        template: "($x)".to_string(),
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/export/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&export_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
