use mork_client::MorkClient;
use rocket::http::Status;
use tracing::error;

const TRANSFORM_WAIT_MS: u64 = 300_000;

fn get_mork_client() -> MorkClient {
    MorkClient::new(crate::config::config().mork_url.clone())
}

fn mork_err(e: mork_client::MorkError) -> Status {
    error!(error = %e, "MORK Error during command");
    Status::InternalServerError
}

pub mod copy {
    use super::{get_mork_client, mork_err};
    use mork_client::path_to_sexpr;
    use rocket::http::Status;
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
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.dst_path),
                &path_to_sexpr(&pre_path(&p.operation_id)),
            )
            .await
            .map_err(mork_err)?;
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.src_path),
                &path_to_sexpr(&post_path(&p.operation_id)),
            )
            .await
            .map_err(mork_err)?;
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await
            .map_err(mork_err)?;
        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await
            .map_err(mork_err)
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post_path(&p.operation_id)),
                &path_to_sexpr(&p.dst_path),
            )
            .await
            .map_err(mork_err)
    }
}

pub mod import {
    use super::{get_mork_client, mork_err, TRANSFORM_WAIT_MS};
    use mork_client::path_to_sexpr;
    use rocket::http::Status;
    use std::path::{Path, PathBuf};
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

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&pre),
            )
            .await
            .map_err(mork_err)?;

        client
            .import(&p.target_path, "$", "$", &p.uri)
            .await
            .map_err(mork_err)?;

        client
            .wait_for_available(&p.target_path, TRANSFORM_WAIT_MS)
            .await
            .map_err(mork_err)?;

        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&post),
            )
            .await
            .map_err(mork_err)?;

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("import/{}/pre", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre),
                &path_to_sexpr(&p.target_path),
            )
            .await
            .map_err(mork_err)
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let post = PathBuf::from(format!("import/{}/post", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&post),
                &path_to_sexpr(&p.target_path),
            )
            .await
            .map_err(mork_err)
    }
}

pub mod clear {
    use super::{get_mork_client, mork_err};
    use mork_client::path_to_sexpr;
    use rocket::http::Status;
    use std::path::{Path, PathBuf};
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
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&p.target_path),
                &path_to_sexpr(&pre),
            )
            .await
            .map_err(mork_err)?;
        client
            .clear(&p.target_path, &p.pattern)
            .await
            .map_err(mork_err)
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        let pre = PathBuf::from(format!("clear/{}/pre", p.operation_id));
        client
            .copy(
                Path::new(""),
                &path_to_sexpr(&pre),
                &path_to_sexpr(&p.target_path),
            )
            .await
            .map_err(mork_err)
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

pub mod edit {
    use super::{get_mork_client, mork_err};
    use rocket::http::Status;
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
    ) -> Result<(), Status> {
        let client = get_mork_client();

        let removed_subspace: Vec<&String> = removed.iter().filter(|a| a.contains("|$|")).collect();
        let removed_normal: Vec<&String> = removed.iter().filter(|a| !a.contains("|$|")).collect();
        let added_subspace: Vec<&String> = added.iter().filter(|a| a.contains("|$|")).collect();
        let added_normal: Vec<&String> = added.iter().filter(|a| !a.contains("|$|")).collect();

        // Subspace moves: copy each old location → new location, then clear old location.
        for (del_atom, add_atom) in removed_subspace.iter().zip(added_subspace.iter()) {
            let pattern = del_atom.replace("|$|", "$");
            let template = add_atom.replace("|$|", "$");
            if let Err(e) = client.copy(target_path, &pattern, &template).await {
                error!(pattern = %pattern, template = %template,
                       path = %target_path.display(), error = %e,
                       "edit: failed to copy subspace atoms");
                return Err(mork_err(e));
            }
        }
        for del_atom in &removed_subspace {
            let pattern = del_atom.replace("|$|", "$");
            if let Err(e) = client.clear(target_path, &pattern).await {
                error!(pattern = %pattern, path = %target_path.display(), error = %e,
                       "edit: failed to clear subspace atoms");
                return Err(mork_err(e));
            }
        }

        // Clear each removed regular atom.
        for atom in &removed_normal {
            if let Err(e) = client.clear(target_path, atom).await {
                error!(atom = %atom, path = %target_path.display(), error = %e,
                       "edit: failed to clear atom");
                return Err(mork_err(e));
            }
        }

        // Upload all added regular atoms in one call.
        if !added_normal.is_empty() {
            let data = added_normal
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            if let Err(e) = client.upload(target_path, "$", "$", &data).await {
                error!(path = %target_path.display(), error = %e,
                       "edit: failed to upload atoms");
                return Err(mork_err(e));
            }
        }

        Ok(())
    }

    #[instrument]
    pub async fn execute(p: &Params) -> Result<(), Status> {
        apply_diff(&p.target_path, &p.added, &p.removed).await
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        apply_diff(&p.target_path, &p.removed, &p.added).await
    }

    #[instrument]
    pub async fn redo(p: &Params) -> Result<(), Status> {
        apply_diff(&p.target_path, &p.added, &p.removed).await
    }
}

pub mod transform {
    use super::{get_mork_client, mork_err, TRANSFORM_WAIT_MS};
    use mork_client::path_to_sexpr;
    use rocket::http::Status;
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
    pub async fn execute(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();

        for (idx, (path, _)) in p.output.iter().enumerate() {
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(path),
                    &path_to_sexpr(&pre_output_path(&p.operation_id, idx)),
                )
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
                .copy(
                    Path::new(""),
                    &path_to_sexpr(path),
                    &path_to_sexpr(&post_output_path(&p.operation_id, idx)),
                )
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }

    #[instrument]
    pub async fn undo(p: &Params) -> Result<(), Status> {
        let client = get_mork_client();
        for (idx, (path, _)) in p.output.iter().enumerate() {
            client.clear(path, "$").await.map_err(mork_err)?;
            client
                .copy(
                    Path::new(""),
                    &path_to_sexpr(&pre_output_path(&p.operation_id, idx)),
                    &path_to_sexpr(path),
                )
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
                .copy(
                    Path::new(""),
                    &path_to_sexpr(&post_output_path(&p.operation_id, idx)),
                    &path_to_sexpr(path),
                )
                .await
                .map_err(mork_err)?;
        }

        Ok(())
    }
}
