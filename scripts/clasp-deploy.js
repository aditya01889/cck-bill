#!/usr/bin/env node
// Usage:
//   node scripts/clasp-deploy.js <backend-name|all> <environment>
//
// Examples:
//   node scripts/clasp-deploy.js orders staging
//   node scripts/clasp-deploy.js orders production
//   node scripts/clasp-deploy.js all staging
//   node scripts/clasp-deploy.js all production

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const [, , target, env] = process.argv;
if (!target || !env) {
  console.error('Usage: node scripts/clasp-deploy.js <backend|all> <environment>');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'deploy.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const backends = target === 'all'
  ? config.backends
  : config.backends.filter(b => b.name === target);

if (!backends.length) {
  console.error(`No backend named "${target}" found in deploy.config.json`);
  process.exit(1);
}

const sha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return ''; }
})();
const description = `${env} deploy${sha ? ' @ ' + sha : ''}`;

let anyDeployed = false;

for (const backend of backends) {
  const envConfig = backend.environments[env];

  if (!envConfig) {
    console.log(`⏭  Skipping ${backend.name} — no "${env}" environment configured`);
    continue;
  }

  if (!envConfig.deploymentId) {
    console.log(`⏭  Skipping ${backend.name}/${env} — deploymentId not set in deploy.config.json`);
    continue;
  }

  const backendDir = path.join(__dirname, '..', backend.dir);
  const claspConfig = envConfig.claspConfig;
  const defaultConfig = path.join(backendDir, '.clasp.json');
  const targetConfig = path.join(backendDir, claspConfig);

  // clasp deploy doesn't support --project, so temporarily make the target
  // config the active .clasp.json when deploying a non-default environment.
  let backup = null;
  const needsSwap = claspConfig !== '.clasp.json';
  if (needsSwap) {
    backup = fs.existsSync(defaultConfig) ? fs.readFileSync(defaultConfig, 'utf8') : null;
    fs.copyFileSync(targetConfig, defaultConfig);
  }

  try {
    console.log(`\n▶ ${backend.name} → ${env}`);
    execSync(`npx clasp push --project ${claspConfig} --force`, { cwd: backendDir, stdio: 'inherit' });
    execSync(`npx clasp deploy --deploymentId ${envConfig.deploymentId} --description "${description}"`, { cwd: backendDir, stdio: 'inherit' });
    console.log(`✓ ${backend.name} → ${env} deployed`);
    anyDeployed = true;
  } finally {
    if (needsSwap) {
      if (backup !== null) fs.writeFileSync(defaultConfig, backup);
      else fs.unlinkSync(defaultConfig);
    }
  }
}

if (!anyDeployed) {
  console.log('\nNothing deployed. Check deploy.config.json for missing deploymentIds.');
  process.exit(1);
}
