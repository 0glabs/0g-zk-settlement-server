const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const https = require('https');
const fs = require('fs');
const woker = require('./core/prove_verify');
const utils = require('zk-settlement-client/src/common/utils');
const { genKeyPair, signData } = require('zk-settlement-client/src/client');
const { callRustFunction } = require('./core/rust_engine_wrapper');
const { verifySig, generateProofInput } = require('zk-settlement-client/src/common/helper')
const { Request } = require('zk-settlement-client/src/common/request');


const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/sign-keypair', async (_, res) => {
    try {
        const { packPrivkey0, packPrivkey1, packedPubkey0, packedPubkey1 } = await genKeyPair();
        const responseBody = {
            privkey: ["0x" + packPrivkey0.toString(16), "0x" + packPrivkey1.toString(16)],
            pubkey: ["0x" + packedPubkey0.toString(16), "0x" + packedPubkey1.toString(16)],
        };
        res.setHeader('Content-Type', 'application/json');
        res.send(utils.jsonifyData(responseBody));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/signature', async (req, res) => {
    try {
        const { requests, privKey, signResponse } = req.body;

        // check required fields 
        if (!requests || !privKey || signResponse === undefined) {
            throw new Error('Missing required fields in request body');
        }

        const requestInstances = requests.map(data => new Request(
            data.nonce,
            data.reqFee,
            data.userAddress,
            data.providerAddress,
            data.requestHash,
            data.resFee
        ));
        const privKeyBigInt = [BigInt(privKey[0]), BigInt(privKey[1])];
        const signatures = await signData(requestInstances, privKeyBigInt, signResponse);
        console.log('Signatures generated:', signatures);
        const responseBody = {
            signatures: signatures,
        };
        res.setHeader('Content-Type', 'application/json');
        res.send(utils.jsonifyData(responseBody));
    } catch (error) {
        console.error('Get error when sign requests:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/check-sign', async (req, res) => {
    try {
        const { requests, pubKey, signatures, signResponse } = req.body;

        // check required fields
        if (!requests || !pubKey || !signatures || signResponse === undefined) {
            throw new Error('Missing required fields in request body');
        }

        const requestInstances = requests.map(req => new Request(
            req.nonce,
            req.reqFee,
            req.userAddress,
            req.providerAddress,
            req.requestHash,
            req.resFee
        ));
        const isValid = await verifySig(requestInstances, signatures, pubKey, signResponse);
  
        res.setHeader('Content-Type', 'application/json');
        res.send(isValid);
    } catch (error) {
        console.error('Get error when check signatures:', error);
        res.status(500).json({ error: error.message });
    }
});

async function genProofInput(requestBody) {
    // check required fields
    const { requests, l, reqPubkey, reqSignatures, resPubkey, resSignatures } = requestBody;
    if (!requests || !l || !reqPubkey || !reqSignatures || !resPubkey || !resSignatures) {
        throw new Error('Missing required fields in request body');
    }
    // to json
    const requestInstances = requests.map(req => new Request(
        req.nonce,
        req.reqFee,
        req.userAddress,
        req.providerAddress,
        req.requestHash,
        req.resFee
    ));

    return generateProofInput(requestInstances, l, reqPubkey, reqSignatures, resPubkey, resSignatures);
}

app.post('/proof-input', async (req, res) => {
    try {
        const result = await genProofInput(req.body);
        const responseBody = {
            serializedInput: result.serializedInput,
            reqSigner: result.reqSigner,
            resSigner: result.resSigner,
            reqR8: result.reqR8,
            reqS: result.reqS,
            resR8: result.resR8,
            resS: result.resS
        };
        res.setHeader('Content-Type', 'application/json');
        res.send(utils.jsonifyData(responseBody, true));
    } catch (error) {
        console.error('Get error when generate proof input:', error);
        res.status(500).json({ error: error.message });
    }
});

async function generateProof(inputs, useRust = false) {
    if (useRust) {
        const inputStr = JSON.stringify(inputs);
        const result = await callRustFunction('generate_proof', inputStr);
        return JSON.parse(result);
    } else {
        // JavaScript implementation
        return await woker.generateProof(inputs);
    }
}

app.post('/proof', async (req, res) => {
    console.log('Proof generation started');
    try {
        const inputs = Object.keys(req.body).length > 0 ? req.body : null;
        const useRust = req.query.backend === 'rust'; // Use query parameter to choose backend
        console.log(`Proof is generated using ${useRust ? 'Rust' : 'JavaScript'} backend`);
        const { proof, publicSignals } = await generateProof(inputs, useRust);
        console.log('Proof generation completed');
        res.json({
            proof,
            publicSignals
        });
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/proof-combined', async (req, res) => {
    console.log('Generating proof from orignal request data');
    try {
        // Step 1: Generate proof input
        const proofInput = await genProofInput(req.body);

        // Step 2: Generate Solidity calldata
        const useRust = req.query.backend === 'rust'; // Use query parameter to choose backend
        const { proof, publicSignals } = await generateProof(JSON.parse(utils.jsonifyData(proofInput, true)), useRust);
        console.log('Proof generation completed');
        res.json({
            proof,
            publicSignals
        });
    } catch (error) {
        handleError(res, error);
    }
});

async function getSolidityCalldata(inputs, useRust = false) {
    if (useRust) {
        const inputStr = JSON.stringify(inputs);
        const result = await callRustFunction('generate_calldata', inputStr);
        return JSON.parse(result);
    } else {
        // JavaScript implementation
        return await woker.getSolidityCalldata(inputs);
    }
}

app.post('/solidity-calldata', async (req, res) => {
    console.log('Generating Solidity calldata');
    try {
        const inputs = Object.keys(req.body).length > 0 ? req.body : null;
        const useRust = req.query.backend === 'rust'; // Use query parameter to choose backend
        const calldata = await getSolidityCalldata(inputs, useRust);
        res.setHeader('Content-Type', 'application/json');
        res.send(calldata);
        console.log(`Solidity calldata is generated using ${useRust ? 'Rust' : 'JavaScript'} backend`);
    } catch (error) {
        handleError(res, error);
    }
});

app.post('/solidity-calldata-combined', async (req, res) => {
    console.log('Generating solidity calldata from orignal request data');
    try {
        // Step 1: Generate proof input
        const proofInput = await genProofInput(req.body);

        // Step 2: Generate Solidity calldata
        const useRust = req.query.backend === 'rust'; // Use query parameter to choose backend
        const calldata = await getSolidityCalldata(JSON.parse(utils.jsonifyData(proofInput, true)), useRust);
        res.setHeader('Content-Type', 'application/json');
        res.send(calldata);
        console.log(`Solidity calldata generated using ${useRust ? 'Rust' : 'JavaScript'} backend`);
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/vkey', async (req, res) => {
    try {
        const vKey = await woker.getVerificationKey();
        res.json(vKey);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/verifier-contract', async (_, res) => {
    console.log('Generating verifier contract');
    try {
        const verifierCode = await woker.getVerifierContract();
        res.setHeader('Content-Type', 'text/plain');
        res.send(verifierCode);
        console.log('Verifier contract is generated');
    } catch (error) {
        handleError(res, error);
    }
});

app.get('/batch-verifier-contract', async (_, res) => {
    console.log('Generating verifier contract');
    try {
        const verifierCode = await woker.getVerifierContract(true);
        res.setHeader('Content-Type', 'text/plain');
        res.send(verifierCode);
        console.log('Verifier contract is generated');
    } catch (error) {
        handleError(res, error);
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

function handleError(res, error) {
    console.error('Error:', error);
    res.status(500).json({
        status: 'Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
}

async function startServer() {
    try {
        process.env.RUST_LOG = 'info';
        console.log('Initializing server...');

        const port = process.env.JS_PROVER_PORT || 3000;
        const useHttps = process.env.USE_HTTPS === 'true';

        if (useHttps) {
            const keyPath = process.env.SSL_KEY_PATH;
            const certPath = process.env.SSL_CERT_PATH;

            if (!keyPath || !certPath) {
                throw new Error('SSL key and certificate paths must be provided when using HTTPS.');
            }

            const httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };

            https.createServer(httpsOptions, app).listen(port, '0.0.0.0', () => {
                console.log(`Zk-settlement agent running on https://0.0.0.0:${port}`);
            });
        } else {
            http.createServer(app).listen(port, '0.0.0.0', () => {
                console.log(`Zk-settlement agent running on http://0.0.0.0:${port}`);
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
