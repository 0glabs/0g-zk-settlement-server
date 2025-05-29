const snarkjs = require('snarkjs');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

async function getVerificationKey() {
    try {
        return await fs.readFile(config.vkeyPath, 'utf8').then(JSON.parse);
    } catch (error) {
        console.error('Error reading verification key:', error);
        throw error;
    }
}

async function getVerifierContract(if_batch = false) {
    try {
        const templates = {
            groth16: await fs.readFile(path.join(__dirname, '../../node_modules/snarkjs/templates/verifier_groth16.sol.ejs'), 'utf8'),
            plonk: await fs.readFile(path.join(__dirname, '../../node_modules/snarkjs/templates/verifier_plonk.sol.ejs'), 'utf8'),
            fflonk: await fs.readFile(path.join(__dirname, '../../node_modules/snarkjs/templates/verifier_fflonk.sol.ejs'), 'utf8'),
            batchGroth16: await fs.readFile(path.join(__dirname, '../../contract/batch_verifier.sol.ejs'), 'utf8')
        };
        let verifierCode;
        if (if_batch) {
            verifierCode = await snarkjs.zKey.exportSolidityVerifier(config.zkeyPath, { groth16: templates.batchGroth16 });
        } else {
            verifierCode = await snarkjs.zKey.exportSolidityVerifier(config.zkeyPath, templates);
        }
        return verifierCode;
    } catch (error) {
        console.error('Error generating verifier contract:', error);
        throw error;
    }
}

async function generateProof(inputs) {
    if (!inputs) {
        throw new Error("Input is required");
    }

    try {
        console.log('Generating new proof and public input.');
        const start_cal_wnts = Date.now();
        await snarkjs.wtns.calculate(inputs, config.wasmPath, config.wtnsPath, {});
        const end_cal_wnts = Date.now();
        const dua_cal_wnts = end_cal_wnts - start_cal_wnts;
        console.log(`calculate witness time: ${dua_cal_wnts} ms`);
        const start_gen_proof = Date.now();
        const { proof, publicSignals } = await snarkjs.groth16.prove(config.zkeyPath, config.wtnsPath);
        const end_gen_proof = Date.now();
        const dua_gen_proof = end_gen_proof - start_gen_proof;
        console.log(`generate proof time: ${dua_gen_proof} ms`);
        return { proof, publicSignals };
    } catch (error) {
        console.error('Error generating proof:', error);
        throw error;
    }
}

async function getSolidityCalldata(inputs) {
    if (!inputs) {
        throw new Error("Input is required");
    }

    try {
        console.log('Generating new proof...');
        const { proof, publicSignals } = await generateProof(inputs);
        let calldata_str;
        if (proof.protocol === "groth16") {
            calldata_str = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        } else if (proof.protocol === "plonk") {
            calldata_str = await snarkjs.plonk.exportSolidityCallData(proof, publicSignals);
        } else if (proof.protocol === "fflonk") {
            calldata_str = await snarkjs.fflonk.exportSolidityCallData(publicSignals, proof);
        } else {
            throw new Error("Invalid Protocol");
        }

        return parseCalldataString(calldata_str);
    } catch (error) {
        console.error('Error generating Solidity calldata:', error);
        throw error;
    }
}

function parseCalldataString(calldataStr) {
    console.log("Input string:", calldataStr);

    const regex = /\[((?:[^\[\]]+|\[[^\[\]]*\])*)\]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(calldataStr)) !== null) {
        matches.push(match[1]);
    }

    if (matches.length < 4) {
        throw new Error(`Expected at least 4 parts, but found ${matches.length}`);
    }

    const parseArray = (s) => {
        return s.split(',').map(item => item.trim().replace(/(^"|"$)/g, ''));
    };

    const parsePB = (s) => {
        // 移除所有的转义字符
        s = s.replace(/\\"/g, '"');
        // 分割内部数组
        const innerArrays = s.match(/\[([^\]]+)\]/g);

        if (!innerArrays) {
            console.warn("No inner arrays found in pB, falling back to single array parsing");
            return [parseArray(s)];
        }

        return innerArrays.map(arr => parseArray(arr.slice(1, -1)));
    };

    const pA = parseArray(matches[0]);
    const pB = parsePB(matches[1]);
    const pC = parseArray(matches[2]);
    const pubInputs = parseArray(matches[3]);

    const result = {
        pA: pA,
        pB: pB,
        pC: pC,
        pubInputs: pubInputs
    };

    console.log("Parsed result:", JSON.stringify(result, null, 2));

    return result;
}

module.exports = { generateProof, getVerificationKey, getVerifierContract, getSolidityCalldata };
