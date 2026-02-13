use api::rocket;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

#[path = "common.rs"]
mod common;

#[tokio::test]
#[serial]
async fn test_import_success() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock the external URL that the API will fetch content from
    let external_url_mock = server.mock(|when, then| {
        when.method(GET).path("/data");
        then.status(200)
            .header("Content-Type", "text/plain")
            .body("(is-a cat animal)\n(is-a dog animal)");
    });

    // Mock the Mork upload endpoint that receives the fetched content
    let upload_mock = server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    // Use the mock server's URL as the import source
    let import_uri = format!("{}/data", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/test/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "true");

    // Verify that both the URL fetch and the Mork upload were called
    external_url_mock.assert();
    upload_mock.assert();

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
    let import_uri = format!("{}/data", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/other/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
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

    // Mock external URL
    server.mock(|when, then| {
        when.method(GET).path("/data");
        then.status(200)
            .header("Content-Type", "text/plain")
            .body("(is-a cat animal)");
    });

    // Mock Mork upload endpoint
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let import_uri = format!("{}/data", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/test/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
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
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock external URL
    server.mock(|when, then| {
        when.method(GET).path("/data");
        then.status(200)
            .header("Content-Type", "text/plain")
            .body("(is-a cat animal)");
    });

    // Mock Mork upload endpoint
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let import_uri = format!("{}/data", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/test/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
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
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token1 = common::create_test_token("/ns1/", true, true);
    let token2 = common::create_test_token("/ns2/", true, true);

    // Mock external URL
    server.mock(|when, then| {
        when.method(GET).path("/data");
        then.status(200)
            .header("Content-Type", "text/plain")
            .body("(is-a cat animal)");
    });

    // Mock Mork upload endpoint
    server.mock(|when, then| {
        when.method(POST)
            .path_matches(Regex::new(r"/upload/.*").unwrap());
        then.status(200).body("Upload successful");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let import_uri = format!("{}/data", server.base_url());

    // Import to ns1
    let response1 = client
        .post(format!(
            "/spaces/import/ns1/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token1.code.clone()))
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Import to ns2
    let response2 = client
        .post(format!(
            "/spaces/import/ns2/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token2.code.clone()))
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
    let import_uri = format!("{}/data", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/other/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_import_remote_url_failure() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock the external URL to return a 404
    server.mock(|when, then| {
        when.method(GET).path("/not-found");
        then.status(404).body("Not found");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let import_uri = format!("{}/not-found", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/test/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    // Should return 502 Bad Gateway since the remote URL returned an error
    assert_eq!(response.status(), Status::BadGateway);

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_import_empty_content() {
    if !common::is_database_running() {
        eprintln!("Warning: Database not running, skipping test");
        return;
    }
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock external URL returning empty content
    server.mock(|when, then| {
        when.method(GET).path("/empty");
        then.status(200)
            .header("Content-Type", "text/plain")
            .body("");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let import_uri = format!("{}/empty", server.base_url());
    let response = client
        .post(format!(
            "/spaces/import/test/space?uri={}",
            urlencoding::encode(&import_uri)
        ))
        .header(Header::new("authorization", token.code.clone()))
        .dispatch()
        .await;

    // Should return 422 Unprocessable Entity for empty content
    assert_eq!(response.status(), Status::UnprocessableEntity);

    common::teardown_database();
}
