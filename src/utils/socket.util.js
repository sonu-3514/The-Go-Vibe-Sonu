const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const Driver = require('../models/driver.model');

let io;

exports.initSocketIO = (server) => {
  if (io) {
    logger.info('Socket.IO already initialized');
    return io;
  }

  io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  logger.info('Socket.IO server initialized');

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        logger.warn('Socket connection without token - allowing for testing');
        socket.userId = 'anonymous';
        socket.userType = 'guest';
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id, socket.userType = decoded.type;
      logger.info(`Socket authenticated: ${socket.userType} ${socket.userId}`);
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      socket.userId = 'anonymous';
      socket.userType = 'guest';
      next();
    }
  });

  io.on('connection', (socket) => {
    logger.info(`New socket connection: ${socket.id} (${socket.userType} ${socket.userId})`);
    const userRoom = `${socket.userType}_${socket.userId}`;
    socket.join(userRoom);
    logger.info(`Socket ${socket.id} joined room ${userRoom}`);

    socket.on('updateLocation', async (data) => {
      try {
        if (socket.userType !== 'driver') return;
        logger.debug(`Driver ${socket.userId} location update: ${JSON.stringify(data)}`);

        if (data.rideId) {
          io.to(`ride_${data.rideId}`).emit('driverLocation', {
            driverId: socket.userId,
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error('Error in location update:', error);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  global.io = io;
  return io;
};

exports.emitToUser = (userId, event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to user');
    return;
  }
  logger.debug(`Emitting ${event} to user ${userId}`);
  io.to(`user_${userId}`).emit(event, data);
};

exports.emitToDriver = (driverId, event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to driver');
    return;
  }
  logger.debug(`Emitting ${event} to driver ${driverId}`);
  io.to(`driver_${driverId}`).emit(event, data);
};

exports.broadcast = (event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot broadcast');
    return;
  }
  logger.debug(`Broadcasting ${event} to all clients`);
  io.emit(event, data);
};

// New function to notify drivers of new rides
exports.notifyDriversOfNewRide = async (ride) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot notify drivers');
    return;
  }

  try {
    // Find online drivers within 10km of pickup location
    const drivers = await Driver.find({
      status: 'online',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: ride.pickupLocation.coordinates,
          },
          $maxDistance: 10000, // 10km
        },
      },
      'vehicleDetails.type': ride.vehicleType,
    });

    drivers.forEach((driver) => {
      io.to(`driver_${driver._id}`).emit('newRide', {
        rideId: ride._id,
        pickup: ride.pickupLocation?.address || 'Unknown',
        destination: ride.dropoffLocation?.address || 'Unknown',
        distance: ride.distance,
        fare: ride.estimatedFare,
        vehicleType: ride.vehicleType,
      });
    });

    logger.info(`Notified ${drivers.length} drivers of new ride ${ride._id}`);
  } catch (error) {
    logger.error('Error notifying drivers of new ride:', error);
  }
};