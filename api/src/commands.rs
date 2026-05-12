use mork_client::{MorkClient, MorkError};
use tracing::warn;

const TRANSFORM_WAIT_MS: u64 = 300_000;
const RETRY_WAIT_MS: u64 = 5_000;
const RETRY_MAX: u32 = 2;

fn get_mork_client() -> MorkClient {
    MorkClient::new(crate::config::config().mork_url.clone())
}

fn is_lock_conflict(e: &MorkError) -> bool {
    matches!(e, MorkError::BadStatus(401))
}

/// Retry a MORK operation that may fail with a lock conflict (401).
async fn retry_mork<F, Fut, T>(operation: F) -> Result<T, MorkError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, MorkError>>,
{
    let mut attempts = 0;
    loop {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) if is_lock_conflict(&e) && attempts < RETRY_MAX => {
                attempts += 1;
                warn!(attempt = attempts, "MORK lock conflict in command, retrying");
                tokio::time::sleep(std::time::Duration::from_millis(RETRY_WAIT_MS)).await;
            }
            Err(e) => return Err(e),
        }
    }
}

pub mod copy {
    use super::get_mork_client;
    use crate::error::ApiError;
    use mork_client::path_to_sexpr;
    use std::path::{Path, PathBuf};
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
    pub async fn execute(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.dst_path),
                &path_to_sexpr(&pre_path(&p.operation_id)),
            )
            .await?;
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.src_path),
                &path_to_sexpr(&post_path(&p.operation_id)),
            )
            .await?;
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await?;
        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await?;
        Ok(())
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await?;
        Ok(())
    }
}

pub mod import {
    use super::{get_mork_client, TRANSFORM_WAIT_MS};
    use crate::error::ApiError;
    use mork_client::path_to_sexpr;
    use std::path::{Path, PathBuf};
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub target_path: PathBuf,
        pub uri: String,
        pub operation_id: String,
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        let post = PathBuf::from(format!("import/{}/post", p.operation_id));

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&pre),
            )
            .await?;

        client
            .import(&p.target_path, "$", "$", &p.uri)
            .await?;

        client
            .wait_for_available(&p.target_path, TRANSFORM_WAIT_MS)
            .await?;

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&post),
            )
            .await?;

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre),
                &path_to_sexpr(&p.target_path),
            )
            .await?;
        Ok(())
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        let post = PathBuf::from(format!("import/{}/post", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post),
                &path_to_sexpr(&p.target_path),
            )
            .await?;
        Ok(())
    }
}

pub mod clear {
    use super::get_mork_client;
    use crate::error::ApiError;
    use mork_client::path_to_sexpr;
    use std::path::{Path, PathBuf};
    use tracing::instrument;

    #[derive(Debug)]
    pub struct Params {
        pub target_path: PathBuf,
        pub operation_id: String,
        pub pattern: String,
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&pre),
            )
            .await?;
        client.clear(&p.target_path, &p.pattern).await?;
        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre),
                &path_to_sexpr(&p.target_path),
            )
            .await?;
        Ok(())
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();
        client.clear(&p.target_path, &p.pattern).await?;
        Ok(())
    }
}

pub mod edit {
    use super::{get_mork_client, retry_mork};
    use crate::error::ApiError;
    use std::path::PathBuf;
    use tracing::{error, instrument};

    #[derive(Debug, Clone)]
    pub struct Params {
        pub target_path: PathBuf,
        pub added: Vec<String>,
        pub removed: Vec<String>,
        pub operation_id: String,
    }

    async fn apply_diff(
        target_path: &PathBuf,
        added: &[String],
        removed: &[String],
    ) -> Result<(), ApiError> {
        let removed_subspace: Vec<&String> = removed.iter().filter(|a| a.contains("|$|")).collect();
        let removed_normal: Vec<&String> = removed.iter().filter(|a| !a.contains("|$|")).collect();
        let added_subspace: Vec<&String> = added.iter().filter(|a| a.contains("|$|")).collect();
        let added_normal: Vec<&String> = added.iter().filter(|a| !a.contains("|$|")).collect();

        // Subspace moves: copy each old location → new location, then clear old location.
        for (del_atom, add_atom) in removed_subspace.iter().zip(added_subspace.iter()) {
            let pattern = del_atom.replace("|$|", "$");
            let template = add_atom.replace("|$|", "$");
            let tp = target_path.clone();
            retry_mork(|| {
                let client = get_mork_client();
                let tp = tp.clone();
                let pattern = pattern.clone();
                let template = template.clone();
                async move { client.copy(&tp, &pattern, &template).await }
            })
            .await
            .map_err(|e| {
                error!(pattern = %pattern, template = %template,
                       path = %target_path.display(), error = %e,
                       "edit: failed to copy subspace atoms");
                ApiError::Mork(e)
            })?;
        }
        for del_atom in &removed_subspace {
            let pattern = del_atom.replace("|$|", "$");
            let tp = target_path.clone();
            retry_mork(|| {
                let client = get_mork_client();
                let tp = tp.clone();
                let pattern = pattern.clone();
                async move { client.clear(&tp, &pattern).await }
            })
            .await
            .map_err(|e| {
                error!(pattern = %pattern, path = %target_path.display(), error = %e,
                       "edit: failed to clear subspace atoms");
                ApiError::Mork(e)
            })?;
        }

        // Clear each removed regular atom.
        for atom in &removed_normal {
            let tp = target_path.clone();
            let atom_owned = (*atom).clone();
            retry_mork(|| {
                let client = get_mork_client();
                let tp = tp.clone();
                let atom_owned = atom_owned.clone();
                async move { client.clear(&tp, &atom_owned).await }
            })
            .await
            .map_err(|e| {
                error!(atom = %atom, path = %target_path.display(), error = %e,
                       "edit: failed to clear atom");
                ApiError::Mork(e)
            })?;
        }

        // Upload all added regular atoms in one call.
        if !added_normal.is_empty() {
            let data = added_normal
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            let tp = target_path.clone();
            retry_mork(|| {
                let client = get_mork_client();
                let tp = tp.clone();
                let data = data.clone();
                async move { client.upload(&tp, "$", "$", &data).await }
            })
            .await
            .map_err(|e| {
                error!(path = %target_path.display(), error = %e,
                       "edit: failed to upload atoms");
                ApiError::Mork(e)
            })?;
        }

        Ok(())
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), ApiError> {
        apply_diff(&p.target_path, &p.added, &p.removed).await
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), ApiError> {
        apply_diff(&p.target_path, &p.removed, &p.added).await
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), ApiError> {
        apply_diff(&p.target_path, &p.added, &p.removed).await
    }
}

pub mod transform {
    use super::{get_mork_client, TRANSFORM_WAIT_MS};
    use crate::error::ApiError;
    use mork_client::path_to_sexpr;
    use std::path::{Path, PathBuf};
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
    pub async fn execute(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();

        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(path),
                    &path_to_sexpr(&pre_output_path(&p.operation_id, idx)),
                )
                .await?;
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
        client.transform(&input, &output).await?;

        for (path, _) in &p.output {
            client
                .wait_for_available(path, TRANSFORM_WAIT_MS)
                .await?;
        }

        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(path),
                    &path_to_sexpr(&post_output_path(&p.operation_id, idx)),
                )
                .await?;
        }

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();
        for (idx, (path, _)) in p.output.iter().enumerate() {
            client.clear(path, "$").await?;
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(&pre_output_path(&p.operation_id, idx)),
                    &path_to_sexpr(path),
                )
                .await?;
        }
        Ok(())
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), ApiError> {
        let client = get_mork_client();
        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(&post_output_path(&p.operation_id, idx)),
                    &path_to_sexpr(path),
                )
                .await?;
        }

        Ok(())
    }
}
