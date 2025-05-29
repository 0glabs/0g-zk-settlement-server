#!/bin/bash

CIRCUIT_PATH=./circuits
BUILD_DIR=./build
CIRCUIT_NAME=main
PHASE1="$CIRCUIT_PATH"/pot21_final.ptau

if [ -f "$PHASE1" ]; then
    echo "Found Phase 1 ptau file"
else
    echo "No Phase 1 ptau file found. Exiting..."
    exit 1
fi

if [ ! -d "$BUILD_DIR" ]; then
    echo "No build directory found. Creating build directory..."
    mkdir -p "$BUILD_DIR"
fi

echo "****COMPILING CIRCUIT****"
start=`date +%s`
circom "$CIRCUIT_PATH"/"$CIRCUIT_NAME".circom --r1cs --wasm --sym --wat --output "$BUILD_DIR"
end=`date +%s`
echo "DONE ($((end-start))s)"
