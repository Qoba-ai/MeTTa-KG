# Performance Analysis and Optimization Guide

This guide helps you understand benchmark results and optimize the explore endpoint based on real data.

## Understanding Your Results

### Key Metrics

1. **Mean Time**: Average execution time
2. **Std Dev**: Consistency of performance (lower is better)
3. **Throughput**: Operations or expressions per second
4. **Change %**: Performance difference from previous run

### What's Good Performance?

For reference, on a typical development machine:

- **First page load (BFS + DFS)**: 100-300ms
- **Pagination (DFS only)**: 50-150ms
- **Full traversal (100k expressions)**: 5-20 seconds
- **Parsing utilities**: < 1 microsecond per operation

Your results may vary based on:
- Data size and structure
- Network latency to MORK
- Machine specs
- MORK server load

## Analyzing Specific Benchmarks

### `explore_root_first_page`

**What it measures**: Initial page load with subspace discovery

**If slow (> 500ms)**:
- Check network latency between client and MORK
- Profile BFS traversal (Phase 1)
- Consider caching subspace discovery
- Check if MORK is overloaded

**Optimization targets**:
- Reduce BFS depth if possible
- Parallel BFS requests (with caution)
- Cache subspace results in Redis/memory

### `explore_with_pagination`

**What it measures**: Loading additional pages

**If slow (> 300ms)**:
- Profile DFS traversal (Phase 2)
- Check focus_token serialization overhead
- Verify PAGE_SIZE is appropriate

**Optimization targets**:
- Adjust PAGE_SIZE constant (lib.rs:474)
- Optimize token encoding/decoding
- Consider connection pooling

### `explore_full_traversal`

**What it measures**: Complete namespace loading

**If slow**:
- Calculate throughput: `total_expressions / total_time`
- Should be > 5000 expressions/second for good performance

**Optimization targets**:
- Increase PAGE_SIZE for fewer requests
- Implement parallel page fetching
- Consider streaming responses

### `parsing_utilities`

**What it measures**: CPU-bound parsing performance

**If slow (> 10 microseconds)**:
- Profile with flamegraph
- Optimize hot paths in arity/parse_binary_sexp
- Consider caching parsed expressions

**Optimization targets**:
- Reduce string allocations
- Use zero-copy parsing where possible
- Memoize frequent patterns

## Common Performance Issues

### Issue 1: BFS Phase Takes Too Long

**Symptoms**:
- `explore_root_first_page` >> `explore_with_pagination`
- First load is 3-5x slower than subsequent pages

**Solutions**:
1. **Limit BFS depth** - Stop exploring after N levels
2. **Cache subspaces** - Store discovered subspaces for 5 minutes
3. **Lazy loading** - Only discover immediate children, not all descendants

**Code changes**:
```rust
// In lib.rs, limit BFS queue size
const MAX_BFS_QUEUE_SIZE: usize = 1000;
if queue.len() > MAX_BFS_QUEUE_SIZE {
    break; // Stop BFS early
}
```

### Issue 2: DFS Phase Has Poor Throughput

**Symptoms**:
- `explore_full_traversal` < 5000 expressions/second
- Each page takes similar time despite varying content

**Solutions**:
1. **Increase PAGE_SIZE** - Load more expressions per request
2. **Connection pooling** - Reuse HTTP connections
3. **Batch processing** - Process multiple tokens per request

**Code changes**:
```rust
// In lib.rs:474, adjust page size
const PAGE_SIZE: usize = 100; // Increased from 50
```

### Issue 3: High Latency Between Requests

**Symptoms**:
- Each explore call has high baseline time
- Parsing is fast but total time is slow

**Solutions**:
1. **Connection pooling** - Already using reqwest Client (good)
2. **HTTP/2 multiplexing** - Enable in reqwest
3. **Local MORK** - Ensure MORK is on localhost

**Code changes**:
```rust
// In lib.rs:255, enable HTTP/2
pub fn new(base_url: impl Into<String>) -> Self {
    Self {
        client: Arc::new(
            Client::builder()
                .http2_prior_knowledge()
                .pool_max_idle_per_host(10)
                .build()
                .unwrap()
        ),
        base_url: base_url.into(),
    }
}
```

### Issue 4: Memory Growth During Full Traversal

**Symptoms**:
- `bench_result_sizes` shows large allocations
- OOM errors with very large spaces

**Solutions**:
1. **Streaming** - Process expressions as they arrive
2. **Deduplication** - Remove duplicate expressions earlier
3. **Smaller pages** - Reduce PAGE_SIZE to limit memory per request

**Code changes**:
```rust
// Use HashSet for deduplication
let mut seen = HashSet::new();
if seen.insert(&relative_expr) {
    metta_expressions.push(relative_expr);
}
```

## Profiling Deep Dives

### Generate Flamegraph

```bash
cargo install flamegraph
nix develop ../. -c cargo flamegraph --bench explore_benchmark -- --bench
```

This creates `flamegraph.svg` showing where time is spent.

### Look for:
- **Wide bars**: Functions taking most time
- **Deep stacks**: Excessive call depth
- **String operations**: Potential allocation hotspots

### Common Hotspots:
- `strip_prefix` - Consider zero-copy alternative
- `parse_binary_sexp` - Memoize results
- `serde_json::to_string` - Use binary encoding for tokens

## Comparative Benchmarking

### Before/After Optimization

```bash
# Save baseline before changes
nix develop ../. -c cargo bench --bench explore_benchmark -- --save-baseline before

# Make optimization changes to lib.rs
# ...

# Compare against baseline
nix develop ../. -c cargo bench --bench explore_benchmark -- --baseline before
```

### Look for:
- **Green "Performance improved"** - Your changes helped!
- **Red "Performance regressed"** - Revert or investigate
- **p < 0.05** - Statistically significant change

## Scalability Testing

### Test with Different Data Sizes

```bash
# Run scalability benchmarks
nix develop ../. -c cargo bench --bench scalability_benchmark
```

**What to check**:
- **Linear scaling**: Time should grow linearly with data size
- **Constant overhead**: Pagination overhead should be constant
- **Concurrency**: Multiple concurrent requests shouldn't degrade significantly

### Red Flags:
- Exponential time growth - Algorithm issue
- High concurrent degradation - Lock contention
- Memory leaks - Check with valgrind/heaptrack

## Production Optimization Checklist

Before deploying optimizations:

- [ ] Run benchmarks with production-like data
- [ ] Test edge cases (empty spaces, huge expressions)
- [ ] Verify memory usage stays bounded
- [ ] Check error handling doesn't regress
- [ ] Run existing unit tests: `cargo test`
- [ ] Profile in release mode: `cargo bench`
- [ ] Test concurrent load with multiple clients

## Recommended First Steps

If you haven't optimized yet:

1. **Run baseline benchmarks** - Establish current performance
2. **Identify bottleneck** - Is it BFS, DFS, parsing, or network?
3. **Start with low-hanging fruit** - Adjust PAGE_SIZE first
4. **Measure impact** - Re-run benchmarks after each change
5. **Iterate** - Keep what works, revert what doesn't

## Questions to Ask Your Benchmarks

- Is first page load acceptable for users? (< 500ms)
- Can users load more data without noticeable delay? (< 200ms per page)
- Does performance degrade with data size? (should be linear)
- Are parsing functions efficient? (< 1 microsecond)
- Can the system handle concurrent requests? (10+ simultaneous explores)

If you can answer "yes" to all of these, your performance is excellent!
