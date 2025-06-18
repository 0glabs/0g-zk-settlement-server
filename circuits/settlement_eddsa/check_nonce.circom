pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/mimcsponge.circom";

// Computes MiMC([left, right])
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = MiMCSponge(2, 220, 1);
    hasher.ins[0] <== left;
    hasher.ins[1] <== right;
    hasher.k <== 0;
    hash <== hasher.outs[0];
}

// if s == 0 returns [in[0], in[1]]
// if s == 1 returns [in[1], in[0]]
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0;
    out[0] <== (in[1] - in[0])*s + in[0];
    out[1] <== (in[0] - in[1])*s + in[1];
}

// Membership check
// Verifies that merkle proof is correct for given merkle root and a leaf
// pathIndices input is an array of 0/1 selectors telling whether given pathElement is on the left or right side of merkle path
template NonceCheck(traceLen, level) {
    signal input leaves[traceLen];
    signal input roots[2];
    signal input pathElements[traceLen][level];
    signal input pathIndices[traceLen][level];

    component selectorsZero[traceLen][level];
    component hashersZero[traceLen][level];
    component selectors[traceLen][level];
    component hashers[traceLen][level];

    signal oldRoots[traceLen];
    for (var i = 0; i < traceLen; i++) {
        for (var j = 0; j < level; j++) {
            selectorsZero[i][j] = DualMux();
            selectorsZero[i][j].in[0] <== j == 0 ? 0 : hashersZero[i][j - 1].hash;
            selectorsZero[i][j].in[1] <== pathElements[i][j];
            selectorsZero[i][j].s <== pathIndices[i][j];

            hashersZero[i][j] = HashLeftRight();
            hashersZero[i][j].left <== selectorsZero[i][j].out[0];
            hashersZero[i][j].right <== selectorsZero[i][j].out[1];
        }
        
        if (i == 0) {
            hashersZero[i][level - 1].hash === roots[0];
        } else {
            hashersZero[i][level - 1].hash === oldRoots[i - 1];
        }

        for (var j = 0; j < level; j++) {
            selectors[i][j] = DualMux();
            selectors[i][j].in[0] <== j == 0 ? leaves[i] : hashers[i][j - 1].hash;
            selectors[i][j].in[1] <== pathElements[i][j];
            selectors[i][j].s <== pathIndices[i][j];

            hashers[i][j] = HashLeftRight();
            hashers[i][j].left <== selectors[i][j].out[0];
            hashers[i][j].right <== selectors[i][j].out[1];
        }
        oldRoots[i] <== hashers[i][level - 1].hash;
    }

    roots[1] === hashers[traceLen - 1][level - 1].hash;

    signal output newRoot;
    signal output oldRoot;
    oldRoot <== roots[0];
    newRoot <== roots[1];
}
