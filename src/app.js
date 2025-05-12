const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const { initSocketIO } = require('./utils/socket.util');
const connectDB = require('./config/db');
const rideRoutes = require('./routes/ride.routes');
const driverRoutes = require('./routes/driver.routes');
const userRoutes = require('./routes/user.routes');
const authRoutes = require('./routes/auth.routes');
const Geofence = require('./models/geofence.model');
const RideController = require('./controllers/ride.controller');
const cron = require('node-cron');

dotenv.config();

// Optional: Enable Mongoose debug logging to diagnose index issues (remove after testing)
mongoose.set('debug', true);

const app = express();
const server = http.createServer(app);
initSocketIO(server);

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }));
}

app.get('/health', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      return res.status(200).json({ status: 'UP', database: 'Connected' });
    }
    return res.status(500).json({
      status: 'DOWN',
      database: 'Disconnected',
      readyState: mongoose.connection.readyState,
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    return res.status(500).json({
      status: 'DOWN',
      error: error.message,
      database: 'Error',
    });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/drivers', driverRoutes);
app.use('/api/v1/rides', rideRoutes);

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Server error',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  });
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  logger.error(err.stack);
});

const startServer = async () => {
  try {
    await connectDB();
    await initGeofences();

    const serverInstance = server.listen(
      process.env.PORT || 3000,
      () => logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${process.env.PORT || 3000}`)
    );

    // Schedule cleanupExpiredRides every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const count = await RideController.cleanupExpiredRides();
        if (count > 0) {
          logger.info(`Cron job: Marked ${count} rides as expired`);
        }
      } catch (error) {
        logger.error('Cron job error in cleanupExpiredRides:', error);
      }
    });

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      serverInstance.close(() => {
        logger.info('Server closed.');
        mongoose.connection.close(false, () => {
          logger.info('MongoDB connection closed.');
          process.exit(0);
        });
      });
    });

    return serverInstance;
  } catch (err) {
    logger.error(`Error starting server: ${err.message}`);
    process.exit(1);
  }
};

async function initGeofences() {
  try {
    const count = await Geofence.countDocuments();
    if (count === 0) {
      logger.info('Initializing sample geofences...');
      const sampleGeofences = [
        {
          name: 'Main Service Area',
          description: 'Primary service coverage area',
          type: 'service',
          location: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
          },
          radius: 10000,
        },
        {
          name: 'Restricted Zone',
          description: 'No service area',
          type: 'restricted',
          location: {
            type: 'Point',
            coordinates: [77.6100, 12.9800],
          },
          radius: 2000,
        },
        {
          name: 'High Demand Zone',
          description: 'Surge pricing area',
          type: 'surge',
          location: {
            type: 'Point',
            coordinates: [77.5800, 12.9700],
          },
          radius: 3000,
          multiplier: 1.5,
        },
      ];
      await Geofence.insertMany(sampleGeofences);
      logger.info(`Created ${sampleGeofences.length} sample geofences`);
    }
  } catch (error) {
    logger.error(`Error initializing geofences: ${error.message}`);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server };