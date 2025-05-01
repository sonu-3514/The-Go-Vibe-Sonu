const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { runDockerTask } = require('./docker-helper');

// Define paths
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const mongoDataDir = path.join(dataDir, 'mongodb');
const redisDataDir = path.join(dataDir, 'redis');

// Ensure data directories exist
if (!fs.existsSync(mongoDataDir)) {
  console.log('Creating MongoDB data directory...');
  fs.mkdirSync(mongoDataDir, { recursive: true });
}

if (!fs.existsSync(redisDataDir)) {
  console.log('Creating Redis data directory...');
  fs.mkdirSync(redisDataDir, { recursive: true });
}

// Start the databases
const result = runDockerTask('start-db');

if (result.success) {
  console.log('Local databases started successfully');
} else {
  console.error('Failed to start local databases');
  process.exit(1);
}