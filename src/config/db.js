const mongoose = require('mongoose');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const envFilePath = path.resolve(__dirname, '../../.env');

// Read current .env content
const envContent = fs.readFileSync(envFilePath, 'utf8');

// Check if file is being run directly as a script
const isRunningAsScript = require.main === module;

// Connection options with robust settings - compatible with all MongoDB drivers
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 10,
  minPoolSize: 2,
  family: 4
};

/**
 * Connect to MongoDB with retry mechanism
 */
const connectWithRetry = async (uri) => {
  const MAX_RETRIES = 3;
  let retries = MAX_RETRIES;
  
  while (retries > 0) {
    try {
      logger.info(`MongoDB connection attempt ${MAX_RETRIES - retries + 1}/${MAX_RETRIES} to ${uri}`);
      
      // Clear any existing connections
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      
      // Create a new connection
      await mongoose.connect(uri, mongooseOptions);
      logger.info('MongoDB connected successfully');
      
      // Test the connection with a simple command
      const result = await mongoose.connection.db.admin().ping();
      logger.info('MongoDB ping successful:', result);
      
      return true;
    } catch (err) {
      retries--;
      
      // Log detailed error information
      if (err.name === 'MongoServerSelectionError') {
        logger.error(`MongoDB server selection error. Retries left: ${retries}`);
        logger.error(`Available servers: ${JSON.stringify(err.topology?.description?.servers || {})}`);
      } else {
        logger.error(`MongoDB connection error: ${err.message}. Retries left: ${retries}`);
      }
      
      if (retries > 0) {
        const waitTime = 2000; // Fixed 2-second retry interval
        logger.info(`Waiting ${waitTime}ms before next connection attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts: ${err.message}`);
      }
    }
  }
};

/**
 * Get MongoDB connection string based on environment
 */
const getConnectionString = () => {
  // Check environment
  const isDev = process.env.NODE_ENV === 'development';
  const useDockerDb = process.env.USE_DOCKER_DB === 'true';
  
  // Development mode - always use local MongoDB
  if (isDev) {
    logger.info('Using local MongoDB connection for development');
    return 'mongodb://localhost:27017/the-go-vibe';
  }
  
  // Production with Docker
  if (useDockerDb) {
    logger.info('Using Docker MongoDB connection');
    return 'mongodb://root:example@mongo:27017/uber-rapido?authSource=admin';
  }
  
  // Production without Docker - fallback to local
  logger.info('Using local MongoDB connection for production');
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/the-go-vibe';
};

/**
 * Main database connection function
 */
const connectDB = async () => {
  try {
    const connectionString = getConnectionString();
    logger.info(`Attempting to connect to MongoDB at: ${connectionString}`);
    
    // Establish the connection
    await connectWithRetry(connectionString);
    
    // Set up event listeners only after successful connection
    mongoose.connection.on('error', err => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    // Handle application shutdown
    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Closing MongoDB connection...');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed due to app termination');
      process.exit(0);
    });
    
    return true;
  } catch (error) {
    logger.error('Could not connect to MongoDB:', error.message);
    
    // In development, try localhost as fallback if Docker connection fails
    if (process.env.NODE_ENV === 'development' && process.env.USE_DOCKER_DB === 'true') {
      logger.info('Docker connection failed, attempting fallback to localhost MongoDB...');
      try {
        await connectWithRetry('mongodb://localhost:27017/the-go-vibe');
        return true;
      } catch (fallbackError) {
        logger.error('Fallback connection also failed:', fallbackError.message);
      }
    }
    
    // Avoid exiting if called from a test environment
    if (!process.env.JEST_WORKER_ID && !isRunningAsScript) {
      process.exit(1);
    }
    
    throw error;
  }
};

/**
 * Update the USE_DOCKER_DB environment variable
 */
function setDatabaseMode(useDocker) {
  const newValue = useDocker ? 'true' : 'false';
  
  try {
    // Check if variable already exists in .env
    if (envContent.includes('USE_DOCKER_DB=')) {
      // Replace existing value
      const updatedContent = envContent.replace(
        /USE_DOCKER_DB=(true|false)/,
        `USE_DOCKER_DB=${newValue}`
      );
      fs.writeFileSync(envFilePath, updatedContent);
    } else {
      // Append to end of file
      fs.appendFileSync(envFilePath, `\nUSE_DOCKER_DB=${newValue}\n`);
    }
    
    console.log(`Database mode set to: ${useDocker ? 'Docker' : 'Local'}`);
    return true;
  } catch (error) {
    console.error(`Failed to update database mode: ${error.message}`);
    return false;
  }
}

// When run directly as a script
if (require.main === module) {
  // Get command line argument
  const arg = process.argv[2];
  
  if (arg === 'docker') {
    setDatabaseMode(true);
  } else if (arg === 'local') {
    setDatabaseMode(false);
  } else {
    console.log('Usage: node db-switch.js [docker|local]');
    console.log('  docker - Use Docker MongoDB container');
    console.log('  local  - Use localhost MongoDB');
  }
}

// Export only the connectDB function by default
module.exports = connectDB;
// Also export setDatabaseMode as a named export
module.exports.setDatabaseMode = setDatabaseMode;