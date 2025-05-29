pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/gates.circom";
include "../../node_modules/circomlib/circuits/binsum.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../utils/bytes_to_num.circom";
include "../eddsa/eddsa_verify.circom";

template SignatureVerify(traceLen) {
    var i;
    var j;
    var nonceBytesWidth = 8; // unit32:[u8;8]
    var addressBytesWidth = 20; // unit160:[u8; 20]
    var balanceBytesWidth = 16; // unit128:[u8; 16]
    var totalBytesWidth = nonceBytesWidth + balanceBytesWidth + addressBytesWidth * 2;

    signal input signer[32];
    signal input r8[traceLen][32];
    signal input s[traceLen][32];
    signal input serializedRequest[traceLen][totalBytesWidth];

    component verifier[traceLen];
    for (i=0; i<traceLen; i++) {
        verifier[i] = EdDSAVerify(totalBytesWidth);
        verifier[i].R8 <== r8[i];
        verifier[i].S <== s[i];
        verifier[i].A <== signer;
        verifier[i].msg <== serializedRequest[i];
    }
    
    component packNonce[traceLen];
    component packFee[traceLen];
    component packUserAddress[traceLen];
    component packProviderAddress[traceLen];
    for (i=0; i<traceLen; i++) {
        packNonce[i] = Bytes2Num(nonceBytesWidth);
        packFee[i] = Bytes2Num(balanceBytesWidth);
        packUserAddress[i] = Bytes2Num(addressBytesWidth);
        packProviderAddress[i] = Bytes2Num(addressBytesWidth);
        for (j=0; j<nonceBytesWidth; j++) {
            packNonce[i].in[j] <== serializedRequest[i][j];
        }
        for (j=0; j<balanceBytesWidth; j++) {
            packFee[i].in[j] <== serializedRequest[i][nonceBytesWidth + j];
        }
        for (j=0; j<addressBytesWidth; j++) {
            packUserAddress[i].in[j] <== serializedRequest[i][nonceBytesWidth + balanceBytesWidth + j];
        }
        for (j=0; j<addressBytesWidth; j++) {
            packProviderAddress[i].in[j] <== serializedRequest[i][nonceBytesWidth + balanceBytesWidth + addressBytesWidth + j];
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

    signal output nonce[traceLen];
    signal output fee[traceLen];
    signal output userAddress[traceLen];
    signal output providerAddress[traceLen];
    for (i=0; i<traceLen; i++) {
        nonce[i] <== packNonce[i].out;
        fee[i] <== packFee[i].out;
        userAddress[i] <== packUserAddress[i].out;
        providerAddress[i] <== packProviderAddress[i].out;
    }

    for (i=1; i<traceLen; i++) {
        userAddress[i] === userAddress[0];
        providerAddress[i] === providerAddress[0];
    }
}
