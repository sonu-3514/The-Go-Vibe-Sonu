const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middlewares/error.middleware');
const routes = require('./routes');
const logger = require('./utils/logger');
const driverRoutes = require('./routes/driver.routes');
const Geofence = require('./models/geofence.model');

require('dotenv').config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
    app.use(require('morgan')('dev', { stream: logger.stream }));
}

// Connect to database
connectDB();

// Health check route
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    if (mongoose.connection.readyState === 1) {
      // Check if database is responding
      await mongoose.connection.db.admin().ping();
      return res.status(200).json({ status: 'UP', database: 'Connected' });
    } else {
      return res.status(500).json({ 
        status: 'DOWN', 
        database: 'Disconnected',
        readyState: mongoose.connection.readyState
      });
    }
  } catch (error) {
    logger.error('Health check failed:', error);
    return res.status(500).json({ 
      status: 'DOWN', 
      error: error.message,
      database: 'Error'
    });
  }
});

// Routes - use only one of these approaches
app.use('/api/v1', routes);  // This already includes driver routes from index.js
// app.use('/api/v1/drivers', driverRoutes);  // Comment this out to prevent duplicate routes

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  logger.error(err.stack);
});

const PORT = process.env.PORT || 3000;

// Connect to DB and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize geofences
    await initGeofences();
    
    // Start the server only after DB connection is established
    const server = app.listen(
      PORT,
      () => logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );
    
    // Graceful shutdown for Docker
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed.');
        mongoose.connection.close(false, () => {
          logger.info('MongoDB connection closed.');
          process.exit(0);
        });
      });
    });
    
    return server;
  } catch (err) {
    logger.error(`Error starting server: ${err.message}`);
    process.exit(1);
  }
};

// You can add this function to app.js or create a new file called initGeofence.js
async function initGeofences() {
  try {
    // Only create if no geofences exist
    const count = await Geofence.countDocuments();
    
    if (count === 0) {
      logger.info('Initializing sample geofences...');
      
      // Create sample geofence areas
      const sampleGeofences = [
        {
          name: 'Main Service Area',
          description: 'Primary service coverage area',
          type: 'service',
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9716] // Example: Bangalore center
          },
          radius: 10000 // 10km
        },
        {
          name: 'Restricted Zone',
          description: 'No service area',
          type: 'restricted',
          location: {
            type: 'Point',
            coordinates: [77.6100, 12.9800] // Example: Some restricted area
          },
          radius: 2000 // 2km
        },
        {
          name: 'High Demand Zone',
          description: 'Surge pricing area',
          type: 'surge',
          location: {
            type: 'Point',
            coordinates: [77.5800, 12.9700] // Example: High demand area
          },
          radius: 3000, // 3km
          multiplier: 1.5
        }
      ];
      
      await Geofence.insertMany(sampleGeofences);
      logger.info(`Created ${sampleGeofences.length} sample geofences`);
    }
  } catch (error) {
    logger.error(`Error initializing geofences: ${error.message}`);
  }
}

// Start server
if (require.main === module) {
  startServer();
}

module.exports = app;
