# Benchmark Quickstart

This is a quick guide to get you running benchmarks immediately.

## Step 1: Start MORK Server

```bash
cd ../../../MORK
cargo run --release
```

Keep this terminal open - MORK needs to be running for benchmarks.

## Step 2: Load Test Data

In a new terminal:

```bash
cd /home/tim/projects/MeTTa-KG/api/mork_client/benches
./setup_benchmark_data.sh
```

This will load `big.metta` (100k+ lines) into MORK for testing.

## Step 3: Run Benchmarks

### If using Nix (recommended):

```bash
cd /home/tim/projects/MeTTa-KG/api
nix develop . -c cargo bench --bench explore_benchmark
```

### Without Nix:

Make sure you have OpenSSL dev libraries installed:
```bash
# Ubuntu/Debian
sudo apt-get install libssl-dev pkg-config

# Then run:
cd /home/tim/projects/MeTTa-KG/api/mork_client
cargo bench --bench explore_benchmark
```

## Quick Test (Single Benchmark)

To run just one benchmark quickly:

```bash
nix develop ../. -c cargo bench --bench explore_benchmark -- "explore_root_first_page" --quick
```

The `--quick` flag makes it run faster with less statistical rigor (good for development).

## View Results

After running, results are saved in:
```
target/criterion/
```

Open `target/criterion/report/index.html` in a browser to see detailed graphs and statistics.

## Example Output

```
explore_root_first_page time:   [142.35 ms 144.52 ms 146.89 ms]
                        change: [-5.2341% -2.9102% -0.4930%] (p = 0.02 < 0.05)
                        Performance has improved.
```

## Troubleshooting

### "Connection refused" errors
- Make sure MORK is running on http://127.0.0.1:19999
- Check with: `curl http://127.0.0.1:19999/status/\$`

### "No expressions found" warnings
- Run `./setup_benchmark_data.sh` to load test data
- Verify with: `curl "http://127.0.0.1:19999/explore/\$//"`

### OpenSSL errors
- Use the Nix environment: `nix develop . -c cargo bench`
- Or install libssl-dev/openssl-devel

## Next Steps

See [README.md](./README.md) for detailed benchmark descriptions and optimization tips.
