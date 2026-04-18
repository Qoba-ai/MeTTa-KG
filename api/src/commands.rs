use std::env;

use mork_client::MorkClient;
use rocket::http::Status;

// ─── Timeouts ─────────────────────────────────────────────────────────────────

const IMPORT_WAIT_MS: u64 = 300_000;
const TRANSFORM_WAIT_MS: u64 = 300_000;

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn get_mork_client() -> MorkClient {
    MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap())
}

fn mork_err(e: mork_client::MorkError) -> Status {
    eprintln!("[commands] MORK error: {:?}", e);
    Status::InternalServerError
}

// ─── Import ───────────────────────────────────────────────────────────────────

pub mod import {
    use super::{get_mork_client, mork_err, IMPORT_WAIT_MS, TRANSFORM_WAIT_MS};
    use rocket::http::Status;
    use std::path::PathBuf;

    pub struct Params {
        pub target_path: PathBuf,
        pub uri: String,
        pub operation_id: String,
    }

    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        let data = PathBuf::from(format!("import/{}/data", p.operation_id));
        let post = PathBuf::from(format!("import/{}/post", p.operation_id));

        // Step 1: snapshot current target state (for undo).
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

    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        // TODO: follow up with MORK team on the need for this clear call (B is kept as-is if A is empty)
        client.clear(&p.target_path, "$").await.map_err(mork_err)?;
        client.copy(&pre, &p.target_path).await.map_err(mork_err)
    }

    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let post = PathBuf::from(format!("import/{}/post", p.operation_id));
        client.copy(&post, &p.target_path).await.map_err(mork_err)
    }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

pub mod clear {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;

    pub struct Params {
        pub target_path: PathBuf,
        pub operation_id: String,
        pub pattern: String,
    }

    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&p.target_path, &pre).await.map_err(mork_err)?;
        client
            .clear(&p.target_path, &p.pattern)
            .await
            .map_err(mork_err)
    }

    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&pre, &p.target_path).await.map_err(mork_err)
    }

    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client
            .clear(&p.target_path, &p.pattern)
            .await
            .map_err(mork_err)
    }
}

// ─── Transform ────────────────────────────────────────────────────────────────

pub mod transform {
    use super::{get_mork_client, mork_err, TRANSFORM_WAIT_MS};
    use rocket::http::Status;
    use std::path::PathBuf;

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
