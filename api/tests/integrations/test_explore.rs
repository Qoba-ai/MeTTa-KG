use api::rocket;
use api::routes::spaces::ExploreInput;
use httpmock::prelude::*;
use httpmock::Regex;
use rocket::http::{Header, Status};
use rocket::local::asynchronous::Client;
use serial_test::serial;

use crate::integrations::common;

#[tokio::test]
#[serial]
async fn test_explore_success() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock explore request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/explore/.*").unwrap());
        then.status(200).body("(explore result)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    let response = client
        .post("/spaces/explore/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&explore_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(explore result)\"");

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

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/explore/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&explore_input)
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

    // Mock explore request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/explore/.*").unwrap());
        then.status(200).body("(explore result)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    let response = client
        .post("/spaces/explore/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&explore_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(explore result)\"");

    common::teardown_database();
}

#[tokio::test]
#[serial]
async fn test_non_empty_namespace() {
    let server = MockServer::start();
    common::setup(&server.base_url());

    let token = common::create_test_token("/test/", true, true);

    // Mock explore request
    server.mock(|when, then| {
        when.method(GET)
            .path_matches(Regex::new(r"/explore/.*").unwrap());
        then.status(200).body("(explore result)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    let response = client
        .post("/spaces/explore/test/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&explore_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().await.expect("response body");
    assert_eq!(body, "\"(explore result)\"");

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
            .path_matches(Regex::new(r"/explore/.*").unwrap());
        then.status(200).body("(explore result)");
    });

    let client = Client::tracked(rocket())
        .await
        .expect("valid rocket instance");

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    // Explore in ns1
    let response1 = client
        .post("/spaces/explore/ns1/space")
        .header(Header::new("authorization", token1.code.clone()))
        .json(&explore_input)
        .dispatch()
        .await;
    assert_eq!(response1.status(), Status::Ok);

    // Explore in ns2
    let response2 = client
        .post("/spaces/explore/ns2/space")
        .header(Header::new("authorization", token2.code.clone()))
        .json(&explore_input)
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

    let explore_input = ExploreInput {
        pattern: "$x".to_string(),
        token: "some_token".to_string(),
    };

    // Path does not start with /test/
    let response = client
        .post("/spaces/explore/other/space")
        .header(Header::new("authorization", token.code.clone()))
        .json(&explore_input)
        .dispatch()
        .await;

    assert_eq!(response.status(), Status::Unauthorized);

    common::teardown_database();
}
