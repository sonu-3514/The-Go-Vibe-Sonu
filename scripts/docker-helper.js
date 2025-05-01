const { execSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if we need sudo for Docker commands
function needsSudo() {
  try {
    // Try a simple Docker command without sudo
    execSync('docker info', { stdio: 'ignore' });
    return false; // No error, we don't need sudo
  } catch (error) {
    return true; // Error occurred, we need sudo
  }
}

// Execute Docker command with sudo if needed
function execDockerCommand(command) {
  const usesSudo = needsSudo();
  const fullCommand = usesSudo ? `sudo ${command}` : command;
  
  console.log(`Executing: ${fullCommand}`);
  
  try {
    const output = execSync(fullCommand, { encoding: 'utf-8' });
    return { success: true, output };
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main function to run a specific Docker task
function runDockerTask(task, ...args) {
  switch(task) {
    case 'logs':
      const container = args[0] || 'the-go-vibe-backend';
      return execDockerCommand(`docker logs ${container}`);
    
    case 'start-db':
      return startLocalDatabases();
    
    case 'stop-db':
      return execDockerCommand('docker-compose -f docker-compose.dev.yml down');
      
    case 'status':
      return execDockerCommand('docker ps');
      
    case 'compose-up':
      return execDockerCommand('docker-compose up -d');
      
    default:
      console.log('Unknown task. Available tasks:');
      console.log('- logs [container-name]');
      console.log('- start-db');
      console.log('- stop-db');
      console.log('- status');
      console.log('- compose-up');
      return { success: false, error: 'Unknown task' };
  }
}

// Start local databases for development
function startLocalDatabases() {
  // Define paths
  const projectRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(projectRoot, 'data');
  const mongoDataDir = path.join(dataDir, 'mongodb');
  const redisDataDir = path.join(dataDir, 'redis');

  // Ensure data directories exist
  if (!fs.existsSync(mongoDataDir)) {
    console.log('Creating MongoDB data directory...');
    fs.mkdirSync(mongoDataDir, { recursive: true });
    
    // Fix permissions for the data directory
    execDockerCommand(`chmod -R 777 ${mongoDataDir}`);
  }

  if (!fs.existsSync(redisDataDir)) {
    console.log('Creating Redis data directory...');
    fs.mkdirSync(redisDataDir, { recursive: true });
    
    // Fix permissions for the data directory
    execDockerCommand(`chmod -R 777 ${redisDataDir}`);
  }

  // Start databases using docker-compose.dev.yml
  return execDockerCommand('docker-compose -f docker-compose.dev.yml up -d');
}

// If script is run directly from command line
if (require.main === module) {
  const task = process.argv[2];
  const args = process.argv.slice(3);
  
  const result = runDockerTask(task, ...args);
  
  if (result.success) {
    console.log(result.output);
  } else {
    process.exit(1);
  }
}

module.exports = { runDockerTask };