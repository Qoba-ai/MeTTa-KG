use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use mork_client::{MorkClient, Permission};
use std::path::PathBuf;

/// Benchmark the explore endpoint with various scenarios.
///
/// Prerequisites:
/// 1. MORK server must be running on http://127.0.0.1:19999
/// 2. Data must be loaded (e.g., big.metta imported into root namespace)
///
/// To prepare big.metta:
/// ```bash
/// # From the MORK directory
/// curl "http://127.0.0.1:19999/import/\$/\$?uri=file:///path/to/big.metta"
/// ```
///
/// Run benchmarks with:
/// ```bash
/// cargo bench --bench explore_benchmark
/// ```

fn create_client() -> MorkClient {
    MorkClient::new("http://127.0.0.1:8001")
}

fn full_permission() -> Permission {
    Permission::new("", true, true)
}

/// Benchmark explore on root namespace (first page with BFS + DFS)
fn bench_explore_root_first_page(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("explore_root_first_page", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            client.explore(&perm, &path, "").await.unwrap()
        });
    });
}

/// Benchmark explore with pagination (DFS only, no BFS)
fn bench_explore_with_pagination(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    // First, get the focus_token from the first page
    let focus_token = rt.block_on(async {
        let client = create_client();
        let perm = full_permission();
        let path = PathBuf::from("/");

        let result = client.explore(&perm, &path, "").await.unwrap();
        result.focus_token.unwrap_or_default()
    });

    if focus_token.is_empty() {
        eprintln!("Warning: No pagination needed for this dataset");
        return;
    }

    c.bench_function("explore_with_pagination", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            client.explore(&perm, &path, &focus_token).await.unwrap()
        });
    });
}

/// Benchmark multiple pagination rounds
fn bench_explore_full_traversal(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("explore_full_traversal", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            let mut total_expressions = 0;
            let mut focus_token = String::new();
            let mut page_count = 0;

            loop {
                let result = client.explore(&perm, &path, &focus_token).await.unwrap();
                total_expressions += result.metta_expressions.len();
                page_count += 1;

                match result.focus_token {
                    Some(token) => focus_token = token,
                    None => break,
                }

                // Safety limit to prevent infinite loops
                if page_count > 1000 {
                    break;
                }
            }

            (total_expressions, page_count)
        });
    });
}

/// Benchmark explore on subnamespaces
fn bench_explore_subnamespaces(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    // Get available subspaces from root
    let subspaces = rt.block_on(async {
        let client = create_client();
        let perm = full_permission();
        let path = PathBuf::from("/");

        let result = client.explore(&perm, &path, "").await.unwrap();
        result
            .subspaces
            .into_iter()
            .map(|(_, path)| path)
            .take(3) // Benchmark first 3 subspaces
            .collect::<Vec<_>>()
    });

    if subspaces.is_empty() {
        eprintln!("Warning: No subspaces found for benchmarking");
        return;
    }

    let mut group = c.benchmark_group("explore_subnamespaces");

    for subspace in subspaces {
        group.bench_with_input(
            BenchmarkId::from_parameter(subspace.to_string_lossy()),
            &subspace,
            |b, path| {
                b.to_async(&rt).iter(|| async {
                    let client = create_client();
                    let perm = full_permission();

                    client.explore(&perm, path, "").await.unwrap()
                });
            },
        );
    }

    group.finish();
}

/// Benchmark the parsing utilities (no network calls)
fn bench_parsing_utilities(c: &mut Criterion) {
    use mork_client::{arity, parse_binary_sexp, path_to_sexpr, strip_prefix};
    use std::path::Path;

    let mut group = c.benchmark_group("parsing_utilities");

    // Benchmark arity
    group.bench_function("arity_simple", |b| {
        b.iter(|| arity("(a b)"));
    });

    group.bench_function("arity_nested", |b| {
        b.iter(|| arity("(a (b (c (d (e f)))))"));
    });

    group.bench_function("arity_complex", |b| {
        b.iter(|| arity("(axiom (= (T (a $a $b (K $c $d)) (K $a $d)) 1))"));
    });

    // Benchmark parse_binary_sexp
    group.bench_function("parse_binary_simple", |b| {
        b.iter(|| parse_binary_sexp("(a b)"));
    });

    group.bench_function("parse_binary_nested", |b| {
        b.iter(|| parse_binary_sexp("(a (b (c (d e))))"));
    });

    // Benchmark strip_prefix
    group.bench_function("strip_prefix_simple", |b| {
        b.iter(|| strip_prefix("(a b)", Path::new("a")));
    });

    group.bench_function("strip_prefix_deep", |b| {
        b.iter(|| strip_prefix("(a (b (c (d e))))", Path::new("a/b/c")));
    });

    // Benchmark path_to_sexpr
    group.bench_function("path_to_sexpr_simple", |b| {
        b.iter(|| path_to_sexpr(Path::new("foo")));
    });

    group.bench_function("path_to_sexpr_nested", |b| {
        b.iter(|| path_to_sexpr(Path::new("foo/bar/baz/qux")));
    });

    group.finish();
}

/// Benchmark explore_namespaces (for namespace selector)
fn bench_explore_namespaces(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("explore_namespaces_root", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            client.explore_namespaces(&perm, &path).await.unwrap()
        });
    });
}

criterion_group!(
    benches,
    bench_explore_root_first_page,
    bench_explore_with_pagination,
    bench_explore_full_traversal,
    bench_explore_subnamespaces,
    bench_parsing_utilities,
    bench_explore_namespaces,
);

criterion_main!(benches);
