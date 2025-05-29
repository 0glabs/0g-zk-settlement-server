const { runTrustedSetup } = require('../src/core/setup');

runTrustedSetup()
  .then(() => {
    console.log('Trusted setup completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
  