pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/gates.circom";
include "../../node_modules/circomlib/circuits/binsum.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../utils/bytes_to_num.circom";
include "../eddsa/eddsa_verify.circom";

template ResponseSignatureVerify(traceLen) {
    var i;
    var j;
    var requestHashBytesWidth = 32; // unit32:[u8;8]
    var costBytesWidth = 16; // unit128:[u8; 16]
    var totalBytesWidth = requestHashBytesWidth + costBytesWidth;

    signal input signer[32];
    signal input r8[traceLen][32];
    signal input s[traceLen][32];
    signal input serializedResponse[traceLen][totalBytesWidth];

    component verifier[traceLen];
    for (i=0; i<traceLen; i++) {
        verifier[i] = EdDSAVerify(totalBytesWidth);
        verifier[i].R8 <== r8[i];
        verifier[i].S <== s[i];
        verifier[i].A <== signer;
        verifier[i].msg <== serializedResponse[i];
    }
    
    component packFee[traceLen];
    for (i=0; i<traceLen; i++) {
        packFee[i] = Bytes2Num(costBytesWidth);
        for (j=0; j<costBytesWidth; j++) {
            packFee[i].in[j] <== serializedResponse[i][requestHashBytesWidth + j];
        }
    }
    
    component feeIsZero[traceLen];
    component sigValidOrFeeAllZero[traceLen];
    component sumFlag = BinSum(1, traceLen);
    for (i=0; i<traceLen; i++) {
        feeIsZero[i] = IsZero();
        feeIsZero[i].in <== packFee[i].out;
        
        sigValidOrFeeAllZero[i] = OR();
        sigValidOrFeeAllZero[i].a <== verifier[i].result;
        sigValidOrFeeAllZero[i].b <== feeIsZero[i].out;
        
        sumFlag.in[i][0] <== sigValidOrFeeAllZero[i].out;
    }

    var sumFlagOutBits = nbits((2**1 -1)*traceLen);
    component packFlag = Bits2Num(sumFlagOutBits);
    packFlag.in <== sumFlag.out;
    packFlag.out === traceLen;

    signal output fee[traceLen];
    for (i=0; i<traceLen; i++) {
        fee[i] <== packFee[i].out;
    }
}
