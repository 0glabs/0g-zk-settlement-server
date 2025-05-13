pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "./settlement_eddsa/commit_account.circom";
include "./hasher/pedersen_bytes.circom";
include "./settlement_eddsa/check_balance.circom";
include "./settlement_eddsa/check_nonce.circom";
include "./settlement_eddsa/verify_request_signature.circom";
include "./settlement_eddsa/verify_response_signature.circom";
include "./utils/bytes_to_num.circom";

// l: trace length
template SettleTrace(l) {
    var i;
    var j; 
    
    var nonceBytesWidth = 8; // unit32:[u8;8]
    var addressBytesWidth = 20; // unit160:[u8; 20]
    var balanceBytesWidth = 16; // unit128:[u8; 16]
    var requestHashBytesWidth = 32; // unit128:[u8; 32]
    var requestBytesWidth = nonceBytesWidth + balanceBytesWidth + addressBytesWidth * 2;
    var responseBytesWidth = requestHashBytesWidth + balanceBytesWidth;

    // request content
    // every settlment just process one account, so the reqSigner should be same
    signal input reqSigner[2];
    signal input reqR8[l][32];
    signal input reqS[l][32];
    signal input serializedInput[l][requestBytesWidth + responseBytesWidth];

    signal input resSigner[2];
    signal input resR8[l][32];
    signal input resS[l][32];

    // verify request signature
    component reqSigVerifier = SignatureVerify(l);
    for (i=0; i<l; i++) {
        for (j=0; j<requestBytesWidth; j++) {
            reqSigVerifier.serializedRequest[i][j] <== serializedInput[i][j];
        }
    }
    reqSigVerifier.r8 <== reqR8;
    reqSigVerifier.s <== reqS;
    component unpackSigner0 = Num2Bytes(16);
    component unpackSigner1 = Num2Bytes(16);
    unpackSigner0.in <== reqSigner[0];
    unpackSigner1.in <== reqSigner[1];
    for (i=0; i<16; i++) {
        reqSigVerifier.signer[i] <== unpackSigner0.out[i];
        reqSigVerifier.signer[16 + i] <== unpackSigner1.out[i];
    }
    signal output userAddress;
    signal output providerAddress;
    userAddress <== reqSigVerifier.userAddress[0];
    providerAddress <== reqSigVerifier.providerAddress[0];

    // verify response signature
    component resSigVerifier = ResponseSignatureVerify(l);
    for (i=0; i<l; i++) {
        for (j=0; j<responseBytesWidth; j++) {
            resSigVerifier.serializedResponse[i][j] <== serializedInput[i][requestBytesWidth + j];
        }
    }
    resSigVerifier.r8 <== resR8;
    resSigVerifier.s <== resS;
    component resUnpackSigner0 = Num2Bytes(16);
    component resUnpackSigner1 = Num2Bytes(16);
    resUnpackSigner0.in <== resSigner[0];
    resUnpackSigner1.in <== resSigner[1];
    for (i=0; i<16; i++) {
        resSigVerifier.signer[i] <== resUnpackSigner0.out[i];
        resSigVerifier.signer[16 + i] <== resUnpackSigner1.out[i];
    }

    // check nonce is valid
    component checkNonce = NonceCheck(l);
    checkNonce.nonce <== reqSigVerifier.nonce;
    signal output initNonce;
    signal output finalNonce;
    initNonce <== checkNonce.initNonce;
    finalNonce <== checkNonce.finalNonce;

    // check balance trace is valid
    component checkBalance = BalanceCheck(l);
    checkBalance.fee <== reqSigVerifier.fee;
    component checkCost = BalanceCheck(l);
    checkCost.fee <== resSigVerifier.fee;
    
    signal output totalFee;
    totalFee <== checkBalance.totalFee + checkCost.totalFee;

    // check req&res are paired
    component requestHashes[l];
    for (i=0; i<l; i++) {
        requestHashes[i] = PedersenBytes(requestBytesWidth - balanceBytesWidth);
        for (j=0; j<nonceBytesWidth; j++) {
            requestHashes[i].hashInput[j] <== serializedInput[i][j];
        }
        for (j=0; j<addressBytesWidth*2; j++) {
            requestHashes[i].hashInput[j + nonceBytesWidth] <== serializedInput[i][j + nonceBytesWidth + balanceBytesWidth];
        }
        for (j=0; j<requestHashBytesWidth; j++) {
            serializedInput[i][requestBytesWidth + j] === requestHashes[i].hashOutput[j];
        }
    }
}
