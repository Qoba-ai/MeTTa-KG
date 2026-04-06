#!/bin/bash

# Setup script for loading benchmark data into MORK
# This script prepares the database for running explore benchmarks

set -e

MORK_URL="http://127.0.0.1:8001"
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIG_METTA="$PROJECT_ROOT/data/big.metta"

echo "================================================"
echo "MorkClient Benchmark Data Setup"
echo "================================================"

# Check if MORK is running
echo -n "Checking if MORK server is running... "
if ! curl -s "$MORK_URL/status/\$" > /dev/null 2>&1; then
    echo "FAILED"
    echo ""
    echo "Error: MORK server is not running on $MORK_URL"
    echo "Please start MORK first:"
    echo "  cd $PROJECT_ROOT/MORK"
    echo "  cargo run --release"
    exit 1
fi
echo "OK"

# Check if big.metta exists
echo -n "Checking if big.metta exists... "
if [ ! -f "$BIG_METTA" ]; then
    echo "FAILED"
    echo ""
    echo "Error: big.metta not found at $BIG_METTA"
    echo "This file is required for benchmarking large datasets."
    exit 1
fi
echo "OK"

# Get big.metta stats
LINE_COUNT=$(wc -l < "$BIG_METTA")
echo "big.metta contains $LINE_COUNT lines"

# Clear existing data (optional - ask user)
read -p "Clear existing MORK data before import? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Clearing MORK data..."
    curl -s "$MORK_URL/clear/\$" > /dev/null
    echo "Data cleared."
fi

# Import big.metta
echo ""
echo "Importing big.metta into MORK..."
echo "This may take a while for large files..."

# Use file:// URI to import
FILE_URI="file://$BIG_METTA"
IMPORT_URL="$MORK_URL/import/\$/\$?uri=$(printf '%s' "$FILE_URI" | jq -sRr @uri)"

START_TIME=$(date +%s)
if curl -s "$IMPORT_URL" > /dev/null; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "Import completed in ${DURATION}s"
else
    echo "Import failed!"
    exit 1
fi

# Verify data was imported
echo ""
echo "Verifying import..."
STATUS=$(curl -s "$MORK_URL/status/\$")
echo "MORK status: $STATUS"

# Test explore endpoint
echo ""
echo "Testing explore endpoint..."
EXPLORE_RESULT=$(curl -s "$MORK_URL/explore/\$//")
EXPR_COUNT=$(echo "$EXPLORE_RESULT" | jq 'length' 2>/dev/null || echo "unknown")
echo "Explore returned $EXPR_COUNT expressions"

echo ""
echo "================================================"
echo "Setup complete!"
echo "================================================"
echo ""
echo "You can now run benchmarks with:"
echo "  cd $PROJECT_ROOT/api/mork_client"
echo "  cargo bench --bench explore_benchmark"
echo ""
