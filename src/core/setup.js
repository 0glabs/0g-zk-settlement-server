const snarkjs = require('snarkjs');
const fs = require('fs').promises;
const readline = require('readline');
const config = require('../config');
let crypto = require('crypto');

function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function runTrustedSetup() {
    console.log('Starting trusted setup...');

    async function measureTime(operation) {
        const start = Date.now();
        await operation();
        const end = Date.now();
        const duration = Math.floor((end - start) / 1000);
        console.log(`DONE (${formatTime(duration)})`);
    }

    try {
        console.log('****GENERATE ZKEY 0****');
        await measureTime(async () => {
            try {
                await snarkjs.zKey.newZKey(
                    `${config.buildDir}/${config.circuitName}.r1cs`,
                    config.ptauPath,
                    `${config.buildDir}/${config.circuitName}_0.zkey`
                );
            } catch (innerError) {
                console.error('Error generating zkey 0:', innerError);
                throw new Error(`Failed to generate zkey 0: ${innerError.message}`);
            }
        });

        console.log('****CONTRIBUTE TO THE PHASE 2 CEREMONY****');
        await measureTime(async () => {
            await snarkjs.zKey.contribute(
                `${config.buildDir}/${config.circuitName}_0.zkey`,
                `${config.buildDir}/${config.circuitName}_1.zkey`,
                "ZeroGravity",
                crypto.randomBytes(32).toString('hex')
            );
        });
        
        console.log('****GENERATING FINAL ZKEY****');
        await measureTime(async () => {
            await snarkjs.zKey.beacon(
                `${config.buildDir}/${config.circuitName}_1.zkey`,
                `${config.buildDir}/${config.circuitName}.zkey`,
                "Final Beacon phase2",
                crypto.randomBytes(32).toString('hex'),
                10
            );
        });

        console.log('****VERIFYING FINAL ZKEY****');
        await measureTime(async () => {
            const verified = await snarkjs.zKey.verifyFromR1cs(
                `${config.buildDir}/${config.circuitName}.r1cs`,
                config.ptauPath,
                `${config.buildDir}/${config.circuitName}.zkey`
            );
            if (!verified) {
                throw new Error("zkey verification failed");
            }
            console.log("zkey verification successful!");
        });

        console.log('****EXPORTING VERIFICATION KEY****');
        await measureTime(async () => {
            const vKey = await snarkjs.zKey.exportVerificationKey(`${config.buildDir}/${config.circuitName}.zkey`);
            await fs.writeFile(`${config.buildDir}/vkey.json`, JSON.stringify(vKey, null, 2));
        });
    } catch (error) {
        console.error('Error during setup:', error);
        throw error;
    }
}

module.exports = { runTrustedSetup };
