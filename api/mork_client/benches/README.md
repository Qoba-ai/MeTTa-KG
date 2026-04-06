# MorkClient Benchmarks

This directory contains benchmarks for the MorkClient, specifically focused on testing the performance of the `explore` endpoint with various data sizes and scenarios.

## Prerequisites

Before running benchmarks, ensure:

1. **MORK server is running**:
   ```bash
   cd ../../MORK
   cargo run --release
   ```

2. **Test data is loaded** (big.metta for stress testing):
   ```bash
   # From the project root
   ./api/mork_client/benches/setup_benchmark_data.sh
   ```

## Running Benchmarks

### Run all benchmarks:
```bash
cd api/mork_client
cargo bench --bench explore_benchmark
```

### Run specific benchmark:
```bash
cargo bench --bench explore_benchmark -- "explore_root_first_page"
```

### Run with baseline for comparison:
```bash
# Save baseline
cargo bench --bench explore_benchmark -- --save-baseline my-baseline

# Make changes to code...

# Compare against baseline
cargo bench --bench explore_benchmark -- --baseline my-baseline
```

## Benchmark Descriptions

### `explore_root_first_page`
Tests the first page of explore on the root namespace. This includes:
- Phase 1: BFS to discover all subspaces
- Phase 2: DFS to collect first 50 metta_expressions

**Key metric**: Time to complete first page load

### `explore_with_pagination`
Tests subsequent page loads (DFS only, no BFS). This simulates clicking "Load More" in the UI.

**Key metric**: Time to load additional 50 expressions

### `explore_full_traversal`
Loads ALL expressions from a namespace by repeatedly calling explore until no focus_token is returned.

**Key metric**: Total time and expressions/second for complete traversal

### `explore_subnamespaces`
Benchmarks explore on the first 3 subnamespaces found at root level.

**Key metric**: Performance comparison across different subspaces

### `parsing_utilities`
Benchmarks the core parsing functions without network overhead:
- `arity` - Count elements in S-expressions
- `parse_binary_sexp` - Parse binary expressions
- `strip_prefix` - Strip namespace prefix
- `path_to_sexpr` - Convert path to S-expression

**Key metric**: Pure CPU performance of parsing logic

### `explore_namespaces_root`
Benchmarks the namespace explorer endpoint (used for namespace selector UI).

**Key metric**: Time to discover all namespaces

## Understanding Results

Criterion outputs detailed statistics for each benchmark:

```
explore_root_first_page time:   [142.35 ms 144.52 ms 146.89 ms]
                        change: [-5.2341% -2.9102% -0.4930%] (p = 0.02 < 0.05)
```

- **time**: Mean execution time with confidence interval
- **change**: Performance change from previous run (if available)
- **p-value**: Statistical significance (< 0.05 = significant change)

## Optimizing Performance

If benchmarks show performance issues:

1. **Phase 1 (BFS) is slow**: Consider caching subspace discovery or limiting BFS depth
2. **Phase 2 (DFS) is slow**: Adjust PAGE_SIZE constant in lib.rs
3. **Parsing is slow**: Profile the parsing utilities and optimize hot paths
4. **Network latency**: Ensure MORK is running locally, not remote

## Profiling

For deeper analysis, use flamegraphs:

```bash
cargo install flamegraph
cargo flamegraph --bench explore_benchmark -- --bench
```

This generates an SVG flamegraph showing where time is spent.

## CI/CD Integration

To run benchmarks in CI without generating reports:

```bash
cargo bench --bench explore_benchmark -- --test
```

This runs benchmarks once without statistical analysis (faster).
