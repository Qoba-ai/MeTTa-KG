use rocket::futures::future::join_all;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::tokio::io::AsyncReadExt;
use serde::{Deserialize, Serialize};
use url::Url;

use rocket::response::status::Custom;
use rocket::{get, post, Data};
use std::path::PathBuf;

use crate::model::Token;
use crate::mork_api::{
    ClearRequest, ExploreRequest, ExportFormat, ExportRequest, ImportRequest, MorkApiClient,
    Pattern, ReadRequest, Request, Template, TransformDetails, TransformRequest, UploadRequest,
};

/// The input for a transformation operation.
/// see mm2 operations for more    // TODO: Add links
#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Mm2InputMulti {
    pub patterns: Vec<String>,
    pub templates: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Mm2Input {
    pub pattern: String,
    pub template: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct ExploreInput {
    pub pattern: String,
    pub token: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct SetOperationInput {
    pub source: Vec<String>,
    pub target: Vec<String>,
}

/// Fetches the `<path..>` space content. Use cautously as it will load everything.
/// It is recommended to use the `/spaces/<path..>?op=explore` instead for large queries
#[get("/spaces/<path..>", rank = 1, data = "<mm2>")]
pub async fn read(
    token: Token,
    path: PathBuf,
    mm2: Option<Json<Mm2InputMulti>>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    // shadowing for backwards compatibility
    // TODO: remove `Option` once all clients are updated
    let mm2 = mm2.unwrap_or(Json(Mm2InputMulti::default()));

    let mork_api_client = MorkApiClient::new();
    let transform_input = TransformDetails::new()
        .patterns(vec![Pattern::default()
            .pattern(mm2.patterns.first().cloned().unwrap_or("$x".to_string()))
            .namespace(path.to_path_buf())])
        .templates(vec![Template::default()
            .template(mm2.templates.first().cloned().unwrap_or("$x".to_string()))
            .namespace(path.to_path_buf())]);
    let request = ReadRequest::new().transform_input(transform_input);

    let response = mork_api_client.dispatch(request).await.map(Json);
    response
}

/// Upload to the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/upload/<path..>", data = "<data>")]
pub async fn upload(
    token: Token,
    path: PathBuf,
    data: Data<'_>,
) -> Result<Json<String>, Custom<String>> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Custom(Status::Unauthorized, "Unauthorized".to_string()));
    }

    let mut body = String::new();
    if let Err(e) = data
        .open(rocket::data::ByteUnit::Mebibyte(20))
        .read_to_string(&mut body)
        .await
    {
        eprintln!("Failed to read body: {e}");
        return Err(Custom(
            Status::BadRequest,
            format!("Failed to read body: {e}"),
        ));
    }

    let pattern = "$x";
    let template = "$x";

    let mork_api_client = MorkApiClient::new();
    let request = UploadRequest::new()
        .namespace(path)
        .pattern(pattern.to_string())
        .template(template.to_string())
        .data(body);

    match mork_api_client.dispatch(request).await {
        Ok(text) => Ok(Json(text)),
        Err(e) => Err(Custom(
            Status::InternalServerError,
            format!("Failed to contact backend: {e}"),
        )),
    }
}

/// Imports data from `<uri>` into the `<path..>` space. Exectes mm2 on the imported data.
#[post("/spaces/import/<path..>?<uri>", data = "<template>")]
pub async fn import(
    token: Token,
    path: PathBuf,
    uri: String,
    template: Option<String>,
) -> Result<Json<bool>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    // validate uri
    if Url::parse(&uri).is_err() {
        return Err(Status::BadRequest);
    }

    let mork_api_client = MorkApiClient::new();
    let template = Template::default()
        .namespace(path)
        .template(template.unwrap_or("$x".to_string()));
    let request = ImportRequest::new().to(template).uri(uri);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

/// Performs an explore operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/explore/<path..>", data = "<explore_input>")]
pub async fn explore(
    token: Token,
    path: PathBuf,
    explore_input: Json<ExploreInput>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExploreRequest::new()
        .namespace(path)
        .pattern(explore_input.pattern.clone())
        .token(explore_input.token.clone());

    println!("explore path: {:?}", request.path());

    let response = mork_api_client.dispatch(request).await.map(Json);
    println!("explore response: {response:?}");
    response
}

/// Performs an export operation on the `<path..>` space. Get the result that
/// matches the `<pattern>` by incrementally traversing the resulting space.
#[post("/spaces/export/<path..>", data = "<export_input>")]
pub async fn export(
    token: Token,
    path: PathBuf,
    export_input: Json<Mm2Input>,
) -> Result<Json<String>, Status> {
    if !path.starts_with(token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ExportRequest::new()
        .namespace(path)
        .pattern(export_input.pattern.clone())
        .template(export_input.template.clone())
        .format(ExportFormat::Metta);

    println!("Dispatching export request to Mork: {}", request.path());

    match mork_api_client.dispatch(request).await {
        Ok(data) => {
            println!("Received export response from Mork: {data:?}");
            Ok(Json(data))
        }
        Err(e) => Err(e),
    }
}

#[post("/spaces/clear/<path..>?<expr>")]
pub async fn clear(token: Token, path: PathBuf, expr: String) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();
    if !path.starts_with(token_namespace) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = ClearRequest::new().namespace(path).expr(expr);

    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

/// Performs a transformation operation on the `<path..>` space
#[post("/spaces/transform/<path..>", data = "<mm2>")]
pub async fn transform(
    token: Token,
    path: PathBuf,
    mm2: Json<Mm2InputMulti>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

    if !path.starts_with(token_namespace) || !token.permission_read || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let mork_api_client = MorkApiClient::new();
    let request = TransformRequest::new().transform_input(
        TransformDetails::new()
            .patterns(
                mm2.patterns
                    .iter()
                    .map(|p| {
                        Pattern::default()
                            .pattern(p.clone())
                            .namespace(path.to_path_buf())
                    })
                    .collect(),
            )
            .templates(
                mm2.templates
                    .iter()
                    .map(|t| {
                        Template::default()
                            .template(t.clone())
                            .namespace(path.to_path_buf())
                    })
                    .collect(),
            ),
    );

    // TODO: use server sent events instead
    match mork_api_client.dispatch(request).await {
        Ok(_) => Ok(Json(true)),
        Err(e) => Err(e),
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// SET OPERATIONS //////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

/// Performs a union operation on provided namespaces. `token` must have `permission_write`
/// on the target namespace and `permission_read` on all source namespaces.
/// # union Transformation
/// ```lisp
/// (transform
///     (, (namespace1 $a) (namespace2 $b))  ; (namespace $c) (namespace $d) etc ...
///     (, (output-namespace $b) (output-namespace $b))  ; $c $d etc ...
/// )
/// ```
///
/// Currently it only handles a single target namespace
#[post("/spaces/union", data = "<operation_input>")]
pub async fn union(
    token: Token,
    operation_input: Json<SetOperationInput>,
) -> Result<Json<bool>, Status> {
    let token_namespace = token.namespace.strip_prefix("/").unwrap();

    // check `permission read`
    let has_read_permission = operation_input
        .source
        .iter()
        .all(|source| source.starts_with(token_namespace))
        && token.permission_read;

    let has_write_permission = operation_input
        .target
        .iter()
        .all(|target| target.starts_with(token_namespace))
        && token.permission_write;

    if !has_read_permission || !has_write_permission {
        return Err(Status::Unauthorized);
    }

    // create a vector of queries
    let transform_inputs = union_transform(operation_input.into_inner())?;

    let futures = transform_inputs
        .iter()
        .map(async |transform_input| {
            let request = TransformRequest::new().transform_input(transform_input.clone());
            let mork_api_client = MorkApiClient::new();

            mork_api_client.dispatch(request).await
        })
        .collect::<Vec<_>>();

    let results = join_all(futures).await;

    // Check if any requests failed
    for result in results {
        if let Err(e) = result {
            Err(e)?
        }
    }

    Ok(Json(true))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// HELPER FUNCTIONS ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

fn union_transform(input: SetOperationInput) -> Result<Vec<TransformDetails>, Status> {
    // Exceed the maximum number of source namespaces for composition, 26
    // and
    // Only one target namespace is allowed
    if input.source.len() > 26 && input.target.len() != 1 {
        return Err(Status::BadRequest);
    }

    let mut union_query: Vec<TransformDetails> = Vec::new();

    for source_ns in input.source.iter() {
        union_query.push(
            TransformDetails::new()
                .patterns(vec![Pattern::default()
                    .namespace(PathBuf::from(source_ns))
                    .pattern("$x".to_string())])
                .templates(vec![Template::default()
                    .namespace(PathBuf::from(input.target.first().unwrap()))
                    .template("$x".to_string())]),
        );
    }

    Ok(union_query)
}

// unit tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_union_transform() {
        let input = SetOperationInput {
            source: vec!["ns1".to_string(), "ns2".to_string()],
            target: vec!["ns3".to_string()],
        };

        let transform_inputs = union_transform(input).unwrap();

        assert_eq!(transform_inputs.len(), 2);

        assert_eq!(
            transform_inputs[0].patterns[0].build(),
            "(ns1 (ns1a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[1].patterns[0].build(),
            "(ns2 (ns2a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[0].templates[0].build(),
            "(ns3 (ns3a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
        assert_eq!(
            transform_inputs[1].templates[0].build(),
            "(ns3 (ns3a727d4f9-836a-4e4c-9480 $x))".to_string()
        );
    }
}
