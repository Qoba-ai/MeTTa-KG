use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use mork_client::{MorkClient, Permission};
use std::path::PathBuf;

/// Scalability benchmarks for the explore endpoint.
///
/// These benchmarks test how performance scales with:
/// - Number of expressions in a namespace
/// - Depth of namespace nesting
/// - Number of subspaces
///
/// Prerequisites: Same as explore_benchmark.rs

fn create_client() -> MorkClient {
    MorkClient::new("http://127.0.0.1:19999")
}

fn full_permission() -> Permission {
    Permission::new("", true, true)
}

/// Benchmark throughput: expressions processed per second
fn bench_explore_throughput(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    // Measure throughput by loading multiple pages
    let mut group = c.benchmark_group("explore_throughput");

    for page_count in [1, 5, 10, 20].iter() {
        group.throughput(Throughput::Elements(*page_count as u64 * 50)); // 50 expressions per page
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}_pages", page_count)),
            page_count,
            |b, &pages| {
                b.to_async(&rt).iter(|| async move {
                    let client = create_client();
                    let perm = full_permission();
                    let path = PathBuf::from("/");

                    let mut focus_token = String::new();
                    let mut total = 0;

                    for _ in 0..pages {
                        let result = client.explore(&perm, &path, &focus_token).await.unwrap();
                        total += result.metta_expressions.len();

                        match result.focus_token {
                            Some(token) => focus_token = token,
                            None => break,
                        }
                    }

                    total
                });
            },
        );
    }

    group.finish();
}

/// Benchmark Phase 1 (BFS) vs Phase 2 (DFS) separately
fn bench_phase_comparison(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("phase_comparison");

    // Phase 1: First request (BFS + DFS)
    group.bench_function("phase1_bfs_plus_dfs", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            client.explore(&perm, &path, "").await.unwrap()
        });
    });

    // Phase 2: Subsequent request (DFS only)
    let focus_token = rt.block_on(async {
        let client = create_client();
        let perm = full_permission();
        let path = PathBuf::from("/");

        let result = client.explore(&perm, &path, "").await.unwrap();
        result.focus_token.unwrap_or_default()
    });

    if !focus_token.is_empty() {
        group.bench_function("phase2_dfs_only", |b| {
            b.to_async(&rt).iter(|| async {
                let client = create_client();
                let perm = full_permission();
                let path = PathBuf::from("/");

                client.explore(&perm, &path, &focus_token).await.unwrap()
            });
        });
    }

    group.finish();
}

/// Benchmark memory efficiency: measure result sizes
fn bench_result_sizes(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("measure_result_memory", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            let result = client.explore(&perm, &path, "").await.unwrap();

            // Return metrics about result sizes
            (
                result.metta_expressions.len(),
                result.subspaces.len(),
                result.metta_expressions.iter().map(|s| s.len()).sum::<usize>(),
                result.subspaces.iter().map(|(s, _)| s.len()).sum::<usize>(),
            )
        });
    });
}

/// Benchmark different page sizes (modifying PAGE_SIZE constant behavior)
fn bench_pagination_overhead(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("pagination_overhead");

    // Simulate loading 200 expressions with different page strategies
    // This shows the overhead of multiple requests vs fewer larger requests

    group.bench_function("load_200_via_pagination", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            let mut focus_token = String::new();
            let mut total = 0;
            let mut requests = 0;

            while total < 200 {
                let result = client.explore(&perm, &path, &focus_token).await.unwrap();
                total += result.metta_expressions.len();
                requests += 1;

                match result.focus_token {
                    Some(token) => focus_token = token,
                    None => break,
                }

                if requests > 10 {
                    break; // Safety limit
                }
            }

            (total, requests)
        });
    });

    group.finish();
}

/// Benchmark concurrent explore requests
fn bench_concurrent_explores(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("concurrent_explores");

    for concurrent in [1, 2, 4, 8].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{}_concurrent", concurrent)),
            concurrent,
            |b, &count| {
                b.to_async(&rt).iter(|| async move {
                    let client = create_client();
                    let perm = full_permission();

                    let mut handles = vec![];

                    for _ in 0..count {
                        let c = client.clone();
                        let p = perm.clone();
                        let path = PathBuf::from("/");

                        handles.push(tokio::spawn(async move {
                            c.explore(&p, &path, "").await
                        }));
                    }

                    let results = futures::future::join_all(handles).await;
                    results.into_iter().filter_map(|r| r.ok()).count()
                });
            },
        );
    }

    group.finish();
}

/// Benchmark explore_namespaces vs explore for namespace discovery
fn bench_namespace_discovery_comparison(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    let mut group = c.benchmark_group("namespace_discovery");

    // Using explore_namespaces (dedicated endpoint)
    group.bench_function("using_explore_namespaces", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            client.explore_namespaces(&perm, &path).await.unwrap()
        });
    });

    // Using explore and extracting subspaces
    group.bench_function("using_explore_subspaces", |b| {
        b.to_async(&rt).iter(|| async {
            let client = create_client();
            let perm = full_permission();
            let path = PathBuf::from("/");

            let result = client.explore(&perm, &path, "").await.unwrap();
            result.subspaces.len()
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_explore_throughput,
    bench_phase_comparison,
    bench_result_sizes,
    bench_pagination_overhead,
    bench_concurrent_explores,
    bench_namespace_discovery_comparison,
);

criterion_main!(benches);
