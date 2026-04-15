//! Command pattern for the three write operations.
//!
//! Each sub-module exposes:
//! - `Params`   – all data the command needs (no token, no event bus)
//! - `execute`  – run the operation for the first time
//! - `undo`     – reverse the operation
//! - `redo`     – re-apply a previously undone operation
//!
//! No permission checking is performed here; that is the caller's responsibility.

use std::env;

use mork_client::MorkClient;
use rocket::http::Status;

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn get_mork_client() -> MorkClient {
    MorkClient::new(env::var("METTA_KG_MORK_URL").unwrap())
}

fn mork_err(_: mork_client::MorkError) -> Status {
    Status::InternalServerError
}

// ─── Import ───────────────────────────────────────────────────────────────────

pub mod import {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;

    pub struct Params {
        /// Target space path, already prefixed with `space/`
        /// (e.g. `space/foo/bar`).
        pub target_path: PathBuf,
        /// Public URL from which to fetch the MeTTa data.
        pub uri: String,
        /// UUID that names the snapshot sub-spaces:
        /// `import/{id}/pre`  – state before import (for undo)
        /// `import/{id}/data` – newly imported data   (for redo)
        pub operation_id: String,
    }

    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        let data = PathBuf::from(format!("import/{}/data", p.operation_id));

        client.copy(&p.target_path, &pre).await.map_err(mork_err)?;
        client
            .import(&data, "$", "$", &p.uri)
            .await
            .map_err(mork_err)?;

        client
            .wait_for_available(&data, 5_000)
            .await
            .map_err(mork_err)?;

        let pre_size = client.count(&pre).await.map_err(mork_err)?;
        let data_size = client.count(&data).await.map_err(mork_err)?;

        let merge_data = data_size < pre_size;

        if merge_data {
            client
                .transform(&vec![(data, "$")], &vec![(p.target_path.clone(), "$")])
                .await
                .map_err(mork_err)?;
        } else {
            client.clear(&p.target_path, "$").await.map_err(mork_err)?;
            client.copy(&data, &p.target_path).await.map_err(mork_err)?;
            client
                .transform(&vec![(pre, "$")], &vec![(p.target_path.clone(), "$")])
                .await
                .map_err(mork_err)?
        }

        Ok(())
    }

    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        client.clear(&p.target_path, "$").await.map_err(mork_err)?;
        client.copy(&pre, &p.target_path).await.map_err(mork_err)?;
        Ok(())
    }

    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        let data = PathBuf::from(format!("import/{}/data", p.operation_id));

        let pre_size = client.count(&pre).await.map_err(mork_err)?;
        let data_size = client.count(&data).await.map_err(mork_err)?;

        let merge_data = data_size < pre_size;

        if merge_data {
            client
                .transform(&vec![(data, "$")], &vec![(p.target_path.clone(), "$")])
                .await
                .map_err(mork_err)
        } else {
            client.clear(&p.target_path, "$").await.map_err(mork_err)?;
            client.copy(&data, &p.target_path).await.map_err(mork_err)?;
            client
                .transform(&vec![(pre, "$")], &vec![(p.target_path.clone(), "$")])
                .await
                .map_err(mork_err)?;
            client
                .wait_for_available(&p.target_path.clone(), 5_000)
                .await
                .map_err(mork_err)
        }
    }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

pub mod clear {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;

    pub struct Params {
        /// Target space path, already prefixed with `space/`.
        pub target_path: PathBuf,
        /// UUID that names the snapshot sub-space:
        /// `clear/{id}/pre` – state before the clear (for undo).
        pub operation_id: String,
    }

    /// Snapshot the target then clear it.
    ///
    /// 1. Snapshot `target` → `clear/{id}/pre`
    /// 2. Clear `target`
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&p.target_path, &pre).await.map_err(mork_err)?;
        client.clear(&p.target_path, "$").await.map_err(mork_err)
    }

    /// Restore `target` from the pre-clear snapshot.
    ///
    /// Copies `clear/{id}/pre` back into `target`.
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client.copy(&pre, &p.target_path).await.map_err(mork_err)
    }

    /// Re-clear `target`.
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client.clear(&p.target_path, "$").await.map_err(mork_err)
    }
}

// ─── Transform ────────────────────────────────────────────────────────────────

pub mod transform {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
    use std::path::PathBuf;

    pub struct Params {
        /// `(augmented path, pattern)` pairs for the input spaces.
        pub input: Vec<(PathBuf, String)>,
        /// `(augmented path, template)` pairs for the output spaces.
        pub output: Vec<(PathBuf, String)>,
        /// UUID reserved for snapshot sub-spaces used by undo/redo.
        pub operation_id: String,
    }

    /// Run the transform.
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

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

        for (path, _pattern) in &input {
            let pre = PathBuf::from(format!("transformation/{}/pre/input", p.operation_id));

            client
                .copy(path, pre.join(path.clone()).as_path())
                .await
                .map_err(mork_err)?;
        }

        for (path, _template) in &output {
            let pre = PathBuf::from(format!("transformation/{}/pre/output", p.operation_id));

            client
                .copy(path, pre.join(path.clone()).as_path())
                .await
                .map_err(mork_err)?;
        }

        client.transform(&input, &output).await.map_err(mork_err)
    }

    /// Reverse the transform by restoring the output spaces.
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let output: Vec<(PathBuf, &str)> = p
            .output
            .iter()
            .map(|(path, tmpl)| (path.clone(), tmpl.as_str()))
            .collect();

        for (path, _template) in &output {
            let pre = PathBuf::from(format!("transformation/{}/pre/output", p.operation_id));

            client.clear(&path.clone(), "$").await.map_err(mork_err)?;
            client
                .copy(pre.join(path.clone()).as_path(), path)
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }

    /// Re-run the transform.
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("transformation/{}/pre/input", p.operation_id));

        let input: Vec<(PathBuf, &str)> = p
            .input
            .iter()
            .map(|(path, pat)| (pre.join(path.clone()), pat.as_str()))
            .collect();
        let output: Vec<(PathBuf, &str)> = p
            .output
            .iter()
            .map(|(path, tmpl)| (path.clone(), tmpl.as_str()))
            .collect();

        client.transform(&input, &output).await.map_err(mork_err)?;

        for (path, _template) in output {
            client
                .wait_for_available(&path.clone(), 60_000)
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }
}
