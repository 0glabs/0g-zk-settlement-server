var ffi = require('ffi-napi');
// const ref = require('ref-napi');
let isRustBackendInitializing = false;
let isRustBackendInitialized = false;

const rustLib = ffi.Library('./build/librust_prover', {
    'init': ['string', []],
    'generate_calldata': ['string', ['string']],
    'generate_proof': ['string', ['string']],
});


async function callRustFunction(funcName, ...args) {
    console.log(`Calling Rust function: ${funcName}`);

    if (!isRustBackendInitialized) {
        if (!isRustBackendInitializing) {
            isRustBackendInitializing = true;
            await initRustBackend();
            isRustBackendInitializing = false;
            isRustBackendInitialized = true;
        } else {
            console.log("Need some time to wait rustback end ready")
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    try {
        const result = rustLib[funcName](...args);
        const output = result.toString().trim();
        console.log(`Result from ${funcName}:`, output);
        return output;
    } catch (error) {
        console.error(`Error calling ${funcName}:`, error);
        throw error;
    }
}

async function initRustBackend() {
    console.log('Initializing Rust backend...');
    const initResult = await callRustFunction('init');
    console.log('Rust backend initialization result:', initResult);
}

module.exports = {
    callRustFunction
};
