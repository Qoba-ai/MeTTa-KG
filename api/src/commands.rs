use std::env;

use mork_client::MorkClient;
use rocket::http::Status;
use tracing::error;

const TRANSFORM_WAIT_MS: u64 = 300_000;

fn get_mork_client() -> MorkClient {
    MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap())
}

fn mork_err(e: mork_client::MorkError) -> Status {
    error!(error = %e, "MORK Error during command");
    Status::InternalServerError
}

pub mod copy {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub src_path: PathBuf,
        pub dst_path: PathBuf,
        pub operation_id: String,
    }

    fn pre_path(op_id: &str) -> PathBuf {
        PathBuf::from(format!("copy/{}/pre", op_id))
    }

    fn post_path(op_id: &str) -> PathBuf {
        PathBuf::from(format!("copy/{}/post", op_id))
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        println!("{:?} {:?}", &p.src_path, &p.dst_path);

        client
            .copy(&p.dst_path, &pre_path(&p.operation_id))
            .await
            .map_err(mork_err)?;
        client
            .copy(&p.src_path, &post_path(&p.operation_id))
            .await
            .map_err(mork_err)?;
        client
            .copy(&post_path(&p.operation_id), &p.dst_path)
            .await
            .map_err(mork_err)?;
        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client
            .copy(&pre_path(&p.operation_id), &p.dst_path)
            .await
            .map_err(mork_err)
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client
            .copy(&post_path(&p.operation_id), &p.dst_path)
            .await
            .map_err(mork_err)
    }
}

pub mod import {
    use super::{get_mork_client, mork_err, TRANSFORM_WAIT_MS};
    use rocket::http::Status;
    use std::path::PathBuf;
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub target_path: PathBuf,
        pub uri: String,
        pub operation_id: String,
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        let post = PathBuf::from(format!("import/{}/post", p.operation_id));

        client.copy(&p.target_path, &pre).await.map_err(mork_err)?;

        client
            .import(&p.target_path, "$", "$", &p.uri)
            .await
            .map_err(mork_err)?;

        client
            .wait_for_available(&p.target_path, TRANSFORM_WAIT_MS)
            .await
            .map_err(mork_err)?;

        client.copy(&p.target_path, &post).await.map_err(mork_err)?;

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        client.copy(&pre, &p.target_path).await.map_err(mork_err)
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let post = PathBuf::from(format!("import/{}/post", p.operation_id));
        client.copy(&post, &p.target_path).await.map_err(mork_err)
    }
}

pub mod clear {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub target_path: PathBuf,
        pub operation_id: String,
        pub pattern: String,
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&p.target_path, &pre).await.map_err(mork_err)?;
        client
            .clear(&p.target_path, &p.pattern)
            .await
            .map_err(mork_err)
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&pre, &p.target_path).await.map_err(mork_err)
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        client
            .clear(&p.target_path, &p.pattern)
            .await
            .map_err(mork_err)
    }
}

pub mod transform {
    use super::{get_mork_client, mork_err, TRANSFORM_WAIT_MS};
    use rocket::http::Status;
    use std::path::PathBuf;
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub input: Vec<(PathBuf, String)>,
        pub output: Vec<(PathBuf, String)>,
        pub operation_id: String,
    }

    fn pre_output_path(op_id: &str, idx: usize) -> PathBuf {
        PathBuf::from(format!("transformation/{}/pre/output/{}", op_id, idx))
    }

    fn post_output_path(op_id: &str, idx: usize) -> PathBuf {
        PathBuf::from(format!("transformation/{}/post/output/{}", op_id, idx))
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(path, &pre_output_path(&p.operation_id, idx))
                .await
                .map_err(mork_err)?;
        }

        let input: Vec<(PathBuf, &str)> = p
            .input
            .iter()
            .map(|(path, pat)| (path.clone(), pat.as_str()))
            .collect();
        let output: Vec<(PathBuf, &str)> = p
            .output
            .iter()
            .map(|(path, tmpl)| (path.clone(), tmpl.as_str()))
            .collect();
        client.transform(&input, &output).await.map_err(mork_err)?;

        for (path, _) in &p.output {
            client
                .wait_for_available(path, TRANSFORM_WAIT_MS)
                .await
                .map_err(mork_err)?;
        }

        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(path, &post_output_path(&p.operation_id, idx))
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        for (idx, (path, _)) in p.output.iter().enumerate() {
            client.clear(&path, "$").await.map_err(mork_err)?;
            client
                .copy(&pre_output_path(&p.operation_id, idx), path)
                .await
                .map_err(mork_err)?;
        }
        Ok(())
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(&post_output_path(&p.operation_id, idx), path)
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }
}
