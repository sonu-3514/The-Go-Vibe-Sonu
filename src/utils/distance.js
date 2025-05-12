const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

let io;

/**
 * Initialize Socket.IO server
 * @param {Object} server - HTTP server instance
 * @returns {Object} - Socket.IO instance
 */
exports.initSocketIO = (server) => {
  if (io) {
    logger.info('Socket.IO already initialized');
    return io;
  }

  // Create Socket.IO server with CORS settings
  io = socketIO(server, {
    cors: {
      origin: '*', 
      methods: ['GET', 'POST']
    }
  });

  logger.info('Socket.IO server initialized');

  // Set up authentication middleware
  io.use(async (socket, next) => {
    try {
      // Get token from handshake auth or query
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        logger.warn('Socket connection rejected: No token provided');
        return next(new Error('Authentication token is required'));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Set user data on socket
      socket.userId = decoded.id;
      socket.userType = decoded.type;
      logger.info(`Socket authenticated: ${socket.userType} ${socket.userId}`);
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection event
  io.on('connection', (socket) => {
    logger.info(`New socket connection: ${socket.id} (${socket.userType} ${socket.userId})`);

    // Join user-specific room for targeted messages
    const userRoom = `${socket.userType}_${socket.userId}`;
    socket.join(userRoom);
    logger.info(`Socket ${socket.id} joined room ${userRoom}`);

    // Location update event for drivers
    socket.on('updateLocation', (data) => {
      try {
        if (socket.userType !== 'driver') {
          logger.warn(`Non-driver tried to update location: ${socket.userId}`);
          return;
        }

        const { latitude, longitude } = data;
        logger.debug(`Driver ${socket.userId} location update: ${latitude}, ${longitude}`);
        
        // Broadcast to any users who need to know this driver's location
        // This will be handled by your driver controller code
      } catch (error) {
        logger.error('Error in location update:', error);
      }
    });

    // Disconnect event
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id} (${socket.userType} ${socket.userId})`);
    });
  });

  // Store io instance globally
  global.io = io;
  
  return io;
};

/**
 * Send event to a specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
exports.emitToUser = (userId, event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to user');
    return;
  }
  
  logger.debug(`Emitting ${event} to user ${userId}`);
  io.to(`user_${userId}`).emit(event, data);
};

/**
 * Send event to a specific driver
 * @param {string} driverId - Driver ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
exports.emitToDriver = (driverId, event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit to driver');
    return;
  }
  
  logger.debug(`Emitting ${event} to driver ${driverId}`);
  io.to(`driver_${driverId}`).emit(event, data);
};

/**
 * Broadcast event to all connected clients
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
exports.broadcast = (event, data) => {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot broadcast');
    return;
  }
  
  logger.debug(`Broadcasting ${event} to all clients`);
  io.emit(event, data);
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      logger.warn('Incomplete coordinates for distance calculation', { lat1, lon1, lat2, lon2 });
      return 5; // Default reasonable distance rather than 0
    }

    // Convert to numbers to ensure correct calculation
    lat1 = parseFloat(lat1);
    lon1 = parseFloat(lon1);
    lat2 = parseFloat(lat2);
    lon2 = parseFloat(lon2);
    
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon1 - lon2);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    
    return distance;
  } catch (error) {
    logger.error('Error calculating distance:', error);
    return 5; // Default reasonable distance in case of error
  }
}

/**
 * Convert degrees to radians
 * @param {number} deg - Degrees
 * @returns {number} - Radians
 */
function deg2rad(deg) {
  return deg * (Math.PI/180);
}

module.exports = { calculateDistance, deg2rad };