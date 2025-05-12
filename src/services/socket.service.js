const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Ride = require('../models/ride.model');
const Vehicle = require('../models/vehicle.model');
const logger = require('../utils/logger');
const { calculateDistance } = require('../utils/distance');

class SocketService {
  constructor(server) {
    this.io = socketIO(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Make io globally available
    global.io = this.io;

    // Setup event listeners
    this.setupListeners();
    
    logger.info('Socket service initialized');
  }
  
  setupListeners() {
    this.io.on('connection', (socket) => {
      logger.info(`New socket connection: ${socket.id}`);
      
      // User connections
      socket.on('userConnect', async (data) => {
        try {
          const { userId, token } = data;
          
          if (!userId) {
            logger.warn('User connection attempt without userId');
            return;
          }
          
          // Join user-specific room
          const userRoom = `user_${userId}`;
          socket.join(userRoom);
          socket.userId = userId; // Store for later use
          
          logger.info(`User ${userId} joined room: ${userRoom}`);
          
          // Update user's socket ID in database for direct messaging
          await User.findByIdAndUpdate(userId, {
            socketId: socket.id,
            lastActive: new Date()
          });
          
          // Notify user of successful connection
          socket.emit('connectionStatus', {
            connected: true,
            userId: userId
          });
          
          // Get user's active ride if any
          const activeRide = await Ride.findOne({
            userId,
            status: { $in: ['pending', 'accepted', 'arrived', 'started'] }
          }).populate('driverId', 'name phone rating vehicleDetails currentLocation');
          
          if (activeRide) {
            // If there's an active ride, emit its details
            socket.emit('activeRideUpdate', this.formatRideForUser(activeRide));
            
            // If ride has a driver, join ride-specific room for updates
            if (activeRide.driverId) {
              socket.join(`ride_${activeRide._id}`);
            }
          }
        } catch (error) {
          logger.error(`Error in userConnect: ${error.message}`);
          socket.emit('connectionStatus', {
            connected: false,
            error: 'Failed to establish connection'
          });
        }
      });
      
      // Driver connections
      socket.on('driverConnect', async (data) => {
        try {
          const { driverId, token } = data;
          
          if (!driverId) {
            logger.warn('Driver connection attempt without driverId');
            return;
          }
          
          // Join driver-specific room
          const driverRoom = `driver_${driverId}`;
          socket.join(driverRoom);
          socket.driverId = driverId; // Store for later use
          
          logger.info(`Driver ${driverId} joined room: ${driverRoom}`);
          
          // Update driver's socket ID in database
          await Driver.findByIdAndUpdate(driverId, {
            socketId: socket.id,
            lastActive: new Date()
          });
          
          // Notify driver of successful connection
          socket.emit('connectionStatus', {
            connected: true,
            driverId: driverId
          });
          
          // Get driver's active ride if any
          const activeRide = await Ride.findOne({
            driverId,
            status: { $in: ['accepted', 'arrived', 'started'] }
          }).populate('userId', 'name phone rating profilePhoto');
          
          if (activeRide) {
            // If there's an active ride, emit its details
            socket.emit('activeRideUpdate', this.formatRideForDriver(activeRide));
            
            // Join ride-specific room for updates
            socket.join(`ride_${activeRide._id}`);
          }
        } catch (error) {
          logger.error(`Error in driverConnect: ${error.message}`);
          socket.emit('connectionStatus', {
            connected: false,
            error: 'Failed to establish connection'
          });
        }
      });
      
      // Driver status update (online/offline toggle)
      socket.on('updateDriverStatus', async (data) => {
        try {
          const { driverId, status } = data;
          
          if (!driverId || !['online', 'offline', 'busy'].includes(status)) {
            return;
          }
          
          // Update driver status in database
          await Driver.findByIdAndUpdate(driverId, { status });
          
          logger.info(`Driver ${driverId} updated status to ${status}`);
          
          // If driver went online, get available rides immediately
          if (status === 'online') {
            const availableRides = await this.getAvailableRidesForDriver(driverId);
            
            if (availableRides.length > 0) {
              socket.emit('availableRides', {
                rides: availableRides
              });
              
              logger.info(`Sent ${availableRides.length} available rides to driver ${driverId}`);
            }
          }
          
          // Acknowledge status update
          socket.emit('statusUpdateAcknowledged', { status });
        } catch (error) {
          logger.error(`Error updating driver status: ${error.message}`);
        }
      });
      
      // Driver location updates
      socket.on('updateDriverLocation', async (data) => {
        try {
          const { driverId, latitude, longitude } = data;
          
          if (!driverId || !latitude || !longitude) {
            return;
          }
          
          // Update driver location in database
          await Driver.findByIdAndUpdate(driverId, {
            currentLocation: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            lastLocationUpdate: new Date()
          });
          
          // Check if driver has an active ride
          const activeRide = await Ride.findOne({
            driverId,
            status: { $in: ['accepted', 'arrived', 'started'] }
          });
          
          if (activeRide) {
            // Store location history for the ride
            await Ride.findByIdAndUpdate(activeRide._id, {
              $push: {
                driverLocationHistory: {
                  location: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                  },
                  timestamp: new Date()
                }
              }
            });
            
            // Emit driver location to the user
            this.io.to(`user_${activeRide.userId}`).emit('driverLocationUpdate', {
              rideId: activeRide._id,
              location: {
                latitude,
                longitude
              },
              timestamp: new Date()
            });
          }
        } catch (error) {
          logger.error(`Error updating driver location: ${error.message}`);
        }
      });
      
      // Driver accepts a ride
      socket.on('acceptRide', async (data) => {
        try {
          const { driverId, rideId } = data;
          
          if (!driverId || !rideId) {
            return;
          }
          
          logger.info(`Driver ${driverId} accepting ride ${rideId} via socket`);
          
          // Find the ride
          const ride = await Ride.findById(rideId);
          
          if (!ride || ride.status !== 'pending' || ride.isExpired) {
            socket.emit('rideAcceptError', {
              message: 'Ride is no longer available'
            });
            return;
          }
          
          // Get driver details
          const driver = await Driver.findById(driverId);
          
          if (!driver) {
            socket.emit('rideAcceptError', {
              message: 'Driver not found'
            });
            return;
          }
          
          // Calculate distance to pickup
          const driverLocation = driver.currentLocation?.coordinates || [0, 0];
          const pickupCoords = ride.pickup?.location?.coordinates || [0, 0];
          
          const distanceToPickup = calculateDistance(
            driverLocation[1], driverLocation[0],
            pickupCoords[1], pickupCoords[0]
          );
          
          const estimatedTimeMinutes = Math.round(distanceToPickup * 3); // 3 min per km
          
          // Add driver to accepted drivers list
          if (!ride.acceptedDrivers) {
            ride.acceptedDrivers = [];
          }
          
          // Check if driver already accepted
          const alreadyAccepted = ride.acceptedDrivers.some(
            d => d.driverId.toString() === driverId.toString()
          );
          
          if (!alreadyAccepted) {
            ride.acceptedDrivers.push({
              driverId,
              driverDetails: {
                name: driver.name,
                phone: driver.phone,
                vehicleDetails: driver.vehicleDetails,
                rating: driver.rating || 5,
                photo: driver.profilePhoto
              },
              distanceToPickup: parseFloat(distanceToPickup.toFixed(2)),
              estimatedTimeMinutes,
              acceptedAt: new Date()
            });
            
            await ride.save();
            
            logger.info(`Added driver ${driverId} to acceptedDrivers for ride ${rideId}`);
          }
          
          // Notify user about driver acceptance
          this.io.to(`user_${ride.userId}`).emit('driverAcceptedRide', {
            rideId,
            driver: {
              id: driver._id,
              name: driver.name,
              phone: driver.phone,
              rating: driver.rating || 5,
              photo: driver.profilePhoto,
              vehicleDetails: driver.vehicleDetails,
              distanceToPickup: parseFloat(distanceToPickup.toFixed(2)),
              estimatedTimeMinutes,
              acceptedAt: new Date(),
              currentLocation: {
                latitude: driverLocation[1],
                longitude: driverLocation[0]
              }
            }
          });
          
          // Notify driver about successful acceptance
          socket.emit('rideAcceptSuccess', {
            rideId,
            pickup: ride.pickup,
            destination: ride.destination,
            fare: ride.fare,
            user: {
              name: ride.userName,
              phone: ride.userPhone
            }
          });
        } catch (error) {
          logger.error(`Error in socket acceptRide: ${error.message}`);
          socket.emit('rideAcceptError', {
            message: 'Failed to accept ride'
          });
        }
      });
      
      // Driver rejects a ride
      socket.on('rejectRide', async (data) => {
        try {
          const { driverId, rideId, reason } = data;
          
          if (!driverId || !rideId) {
            return;
          }
          
          // Find the ride
          const ride = await Ride.findById(rideId);
          
          if (!ride || ride.status !== 'pending') {
            return;
          }
          
          // Add driver to rejected drivers list
          if (!ride.rejectedDrivers) {
            ride.rejectedDrivers = [];
          }
          
          if (!ride.rejectedDrivers.includes(driverId)) {
            ride.rejectedDrivers.push(driverId);
          }
          
          // Remove from accepted drivers if present
          if (ride.acceptedDrivers && ride.acceptedDrivers.length > 0) {
            ride.acceptedDrivers = ride.acceptedDrivers.filter(
              driver => driver.driverId.toString() !== driverId.toString()
            );
          }
          
          await ride.save();
          
          logger.info(`Driver ${driverId} rejected ride ${rideId}`);
          
          // Notify user if driver had previously accepted
          this.io.to(`user_${ride.userId}`).emit('driverRejectedRide', {
            rideId,
            driverId
          });
          
          // Acknowledge rejection to driver
          socket.emit('rideRejectSuccess', {
            rideId
          });
        } catch (error) {
          logger.error(`Error in socket rejectRide: ${error.message}`);
        }
      });
      
      // User confirms a driver
      socket.on('confirmDriver', async (data) => {
        try {
          const { userId, rideId, driverId } = data;
          
          if (!userId || !rideId || !driverId) {
            return;
          }
          
          // Find the ride
          const ride = await Ride.findOne({
            _id: rideId,
            userId,
            status: 'pending'
          });
          
          if (!ride) {
            socket.emit('confirmDriverError', {
              message: 'Ride not found or no longer pending'
            });
            return;
          }
          
          // Check if driver is in acceptedDrivers
          const isDriverAccepted = ride.acceptedDrivers && ride.acceptedDrivers.some(
            driver => driver.driverId.toString() === driverId.toString()
          );
          
          if (!isDriverAccepted) {
            socket.emit('confirmDriverError', {
              message: 'Selected driver has not accepted this ride'
            });
            return;
          }
          
          // Update ride with confirmed driver
          ride.driverId = driverId;
          ride.status = 'accepted';
          ride.acceptedAt = new Date();
          
          await ride.save();
          
          // Get driver details
          const driver = await Driver.findById(driverId);
          
          // Update driver status to busy
          await Driver.findByIdAndUpdate(driverId, { status: 'busy' });
          
          // Notify confirmed driver
          this.io.to(`driver_${driverId}`).emit('rideConfirmed', {
            rideId,
            status: 'accepted',
            user: {
              id: userId,
              name: ride.userName,
              phone: ride.userPhone
            },
            pickup: ride.pickup,
            destination: ride.destination,
            fare: ride.fare
          });
          
          // Notify all other drivers who accepted that ride is no longer available
          if (ride.acceptedDrivers) {
            for (const acceptedDriver of ride.acceptedDrivers) {
              if (acceptedDriver.driverId.toString() !== driverId.toString()) {
                this.io.to(`driver_${acceptedDriver.driverId}`).emit('rideNoLongerAvailable', {
                  rideId,
                  message: 'User selected another driver'
                });
              }
            }
          }
          
          // Notify user about confirmation
          socket.emit('driverConfirmSuccess', {
            rideId,
            status: 'accepted',
            driver: {
              id: driver._id,
              name: driver.name,
              phone: driver.phone,
              rating: driver.rating || 5,
              photo: driver.profilePhoto,
              vehicleDetails: driver.vehicleDetails
            }
          });
          
          // Create ride-specific room and make both join it
          this.io.in(`user_${userId}`).socketsJoin(`ride_${rideId}`);
          this.io.in(`driver_${driverId}`).socketsJoin(`ride_${rideId}`);
        } catch (error) {
          logger.error(`Error in socket confirmDriver: ${error.message}`);
          socket.emit('confirmDriverError', {
            message: 'Failed to confirm driver'
          });
        }
      });
      
      // Update ride status (arrived, started, completed)
      socket.on('updateRideStatus', async (data) => {
        try {
          const { driverId, rideId, status } = data;
          
          if (!driverId || !rideId || !['arrived', 'started', 'completed', 'cancelled'].includes(status)) {
            return;
          }
          
          // Find the ride
          const ride = await Ride.findOne({
            _id: rideId,
            driverId
          });
          
          if (!ride) {
            socket.emit('updateStatusError', {
              message: 'Ride not found or not assigned to you'
            });
            return;
          }
          
          // Validate status transition
          const validTransitions = {
            'accepted': ['arrived', 'cancelled'],
            'arrived': ['started', 'cancelled'],
            'started': ['completed', 'cancelled']
          };
          
          if (!validTransitions[ride.status] || !validTransitions[ride.status].includes(status)) {
            socket.emit('updateStatusError', {
              message: `Cannot update from ${ride.status} to ${status}`
            });
            return;
          }
          
          // Update ride status
          ride.status = status;
          
          // Add timestamp based on status
          if (status === 'arrived') {
            ride.arrivedAt = new Date();
          } else if (status === 'started') {
            ride.startedAt = new Date();
          } else if (status === 'completed') {
            ride.completedAt = new Date();
            
            // Update driver status back to online
            await Driver.findByIdAndUpdate(driverId, { status: 'online' });
          } else if (status === 'cancelled') {
            ride.cancelledAt = new Date();
            ride.cancelledBy = 'driver';
            ride.cancellationReason = data.reason || 'Cancelled by driver';
            
            // Update driver status back to online
            await Driver.findByIdAndUpdate(driverId, { status: 'online' });
          }
          
          await ride.save();
          
          // Broadcast status update to everyone in the ride room
          this.io.to(`ride_${rideId}`).emit('rideStatusUpdate', {
            rideId,
            status,
            timestamp: new Date(),
            message: this.getStatusMessage(status)
          });
          
          // Special handling for completed rides (cleanup)
          if (status === 'completed' || status === 'cancelled') {
            // Remove everyone from the ride room
            this.io.in(`ride_${rideId}`).socketsLeave(`ride_${rideId}`);
          }
          
          // Acknowledge status update to driver
          socket.emit('updateStatusSuccess', {
            rideId,
            status
          });
        } catch (error) {
          logger.error(`Error in socket updateRideStatus: ${error.message}`);
          socket.emit('updateStatusError', {
            message: 'Failed to update ride status'
          });
        }
      });
      
      // User cancels ride
      socket.on('cancelRide', async (data) => {
        try {
          const { userId, rideId, reason } = data;
          
          if (!userId || !rideId) {
            return;
          }
          
          // Find the ride
          const ride = await Ride.findOne({
            _id: rideId,
            userId
          });
          
          if (!ride) {
            socket.emit('cancelRideError', {
              message: 'Ride not found'
            });
            return;
          }
          
          // Check if ride can be cancelled
          if (!['pending', 'accepted', 'arrived'].includes(ride.status)) {
            socket.emit('cancelRideError', {
              message: `Cannot cancel ride in ${ride.status} status`
            });
            return;
          }
          
          // Update ride status
          ride.status = 'cancelled';
          ride.cancelledAt = new Date();
          ride.cancelledBy = 'user';
          ride.cancellationReason = reason || 'Cancelled by user';
          
          await ride.save();
          
          // If a driver was assigned, notify them and update their status
          if (ride.driverId) {
            this.io.to(`driver_${ride.driverId}`).emit('rideCancelled', {
              rideId,
              message: 'Ride cancelled by user',
              reason: reason || 'Cancelled by user'
            });
            
            // Update driver status back to online
            await Driver.findByIdAndUpdate(ride.driverId, { status: 'online' });
          }
          
          // Notify all drivers who accepted but weren't confirmed
          if (ride.acceptedDrivers) {
            for (const acceptedDriver of ride.acceptedDrivers) {
              // Skip the assigned driver (already notified above)
              if (ride.driverId && acceptedDriver.driverId.toString() === ride.driverId.toString()) {
                continue;
              }
              
              this.io.to(`driver_${acceptedDriver.driverId}`).emit('rideNoLongerAvailable', {
                rideId,
                message: 'Ride cancelled by user'
              });
            }
          }
          
          // Notify user about successful cancellation
          socket.emit('cancelRideSuccess', {
            rideId
          });
          
          // Remove everyone from the ride room
          this.io.in(`ride_${rideId}`).socketsLeave(`ride_${rideId}`);
        } catch (error) {
          logger.error(`Error in socket cancelRide: ${error.message}`);
          socket.emit('cancelRideError', {
            message: 'Failed to cancel ride'
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          const userId = socket.userId;
          const driverId = socket.driverId;
          
          if (userId) {
            logger.info(`User ${userId} disconnected`);
            
            // Update user's online status
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              lastActive: new Date()
            });
          }
          
          if (driverId) {
            logger.info(`Driver ${driverId} disconnected`);
            
            // Don't automatically set driver offline - this should be explicit
            // Just update last active timestamp
            await Driver.findByIdAndUpdate(driverId, {
              lastActive: new Date()
            });
          }
        } catch (error) {
          logger.error(`Error handling disconnect: ${error.message}`);
        }
      });
    });
  }
  
  // Helper method to get status messages
  getStatusMessage(status) {
    const messages = {
      'pending': 'Looking for drivers',
      'accepted': 'Driver has accepted your ride',
      'arrived': 'Driver has arrived at pickup location',
      'started': 'Your ride has started',
      'completed': 'Your ride has been completed',
      'cancelled': 'Your ride has been cancelled',
      'expired': 'Your ride request has expired'
    };
    
    return messages[status] || 'Unknown status';
  }
  
  // Helper method to format ride for user
  formatRideForUser(ride) {
    const response = {
      rideId: ride._id,
      status: ride.status,
      pickup: ride.pickup,
      destination: ride.destination,
      fare: ride.fare,
      distance: ride.distance,
      createdAt: ride.createdAt
    };
    
    // Add driver details if available
    if (ride.driverId) {
      const driverLocation = ride.driverId.currentLocation?.coordinates || [0, 0];
      
      response.driver = {
        id: ride.driverId._id,
        name: ride.driverId.name,
        phone: ride.driverId.phone,
        rating: ride.driverId.rating || 5,
        vehicleDetails: ride.driverId.vehicleDetails,
        currentLocation: {
          latitude: driverLocation[1],
          longitude: driverLocation[0]
        }
      };
    }
    
    // Add accepted drivers if ride is pending
    if (ride.status === 'pending' && ride.acceptedDrivers?.length > 0) {
      response.availableDrivers = ride.acceptedDrivers.map(driver => ({
        id: driver.driverId,
        name: driver.driverDetails.name,
        phone: driver.driverDetails.phone,
        rating: driver.driverDetails.rating || 5,
        vehicleDetails: driver.driverDetails.vehicleDetails,
        distanceToPickup: driver.distanceToPickup,
        estimatedTimeMinutes: driver.estimatedTimeMinutes,
        acceptedAt: driver.acceptedAt
      }));
    }
    
    return response;
  }
  
  // Helper method to format ride for driver
  formatRideForDriver(ride) {
    return {
      rideId: ride._id,
      status: ride.status,
      pickup: ride.pickup,
      destination: ride.destination,
      fare: ride.fare,
      distance: ride.distance,
      user: {
        id: ride.userId._id,
        name: ride.userId.name,
        phone: ride.userId.phone,
        rating: ride.userId.rating || 5
      },
      timestamps: {
        created: ride.createdAt,
        accepted: ride.acceptedAt,
        arrived: ride.arrivedAt,
        started: ride.startedAt
      }
    };
  }
  
  // Get available rides for driver
  async getAvailableRidesForDriver(driverId) {
    try {
      // Get driver details
      const driver = await Driver.findById(driverId);
      
      if (!driver || driver.status !== 'online') {
        return [];
      }
      
      // Get driver's vehicle type
      let vehicleType = driver.vehicleDetails?.type || 'Mini';
      
      // Check for active vehicle
      const activeVehicle = await Vehicle.findOne({
        driverId,
        isActive: true
      });
      
      if (activeVehicle) {
        vehicleType = activeVehicle.type;
      }
      
      // Get driver's location
      const driverLocation = driver.currentLocation?.coordinates || [0, 0];
      
      // Find pending rides that match driver's vehicle type
      const pendingRides = await Ride.find({
        status: 'pending',
        vehicleType,
        isExpired: { $ne: true },
        expiresAt: { $gt: new Date() },
        rejectedDrivers: { $ne: driverId } // Exclude rides driver has rejected
      })
      .populate('userId', 'name phone rating profilePhoto')
      .sort({ createdAt: -1 })
      .limit(10);
      
      // Format rides
      const formattedRides = [];
      
      for (const ride of pendingRides) {
        // Calculate distance to pickup
        const pickupCoords = ride.pickup?.location?.coordinates || [0, 0];
        
        const distanceToPickup = calculateDistance(
          driverLocation[1], driverLocation[0],
          pickupCoords[1], pickupCoords[0]
        );
        
        // Skip rides that are too far
        if (distanceToPickup > 15) { // 15km max distance
          continue;
        }
        
        const estimatedTimeMinutes = Math.round(distanceToPickup * 3); // 3 min per km
        
        // Check if driver has already accepted this ride
        const alreadyAccepted = ride.acceptedDrivers && ride.acceptedDrivers.some(
          driver => driver.driverId.toString() === driverId.toString()
        );
        
        formattedRides.push({
          id: ride._id,
          user: {
            id: ride.userId._id,
            name: ride.userId.name,
            rating: ride.userId.rating || 5,
            photo: ride.userId.profilePhoto
          },
          pickup: {
            address: ride.pickup?.address || '',
            latitude: pickupCoords[1],
            longitude: pickupCoords[0]
          },
          destination: {
            address: ride.destination?.address || ''
          },
          fare: ride.fare,
          distance: ride.distance,
          distanceToPickup: parseFloat(distanceToPickup.toFixed(2)),
          estimatedTimeMinutes,
          alreadyAccepted,
          createdAt: ride.createdAt
        });
      }
      
      return formattedRides;
    } catch (error) {
      logger.error(`Error getting available rides for driver: ${error.message}`);
      return [];
    }
  }
  
  // Method to broadcast new ride to nearby drivers
  async notifyDriversAboutNewRide(ride) {
    try {
      // Get the pickup coordinates
      const pickupCoords = ride.pickup?.location?.coordinates || [0, 0];
      
      // Find nearby drivers with matching vehicle type
      const nearbyDrivers = await Driver.find({
        status: 'online',
        'vehicleDetails.type': ride.vehicleType,
        currentLocation: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: pickupCoords
            },
            $maxDistance: 10000 // 10km
          }
        }
      }).limit(20);
      
      logger.info(`Found ${nearbyDrivers.length} nearby drivers for ride ${ride._id}`);
      
      // Notify each driver
      for (const driver of nearbyDrivers) {
        // Calculate distance to pickup
        const driverCoords = driver.currentLocation?.coordinates || [0, 0];
        const distanceToPickup = calculateDistance(
          driverCoords[1], driverCoords[0],
          pickupCoords[1], pickupCoords[0]
        );
        
        // Only notify drivers within reasonable distance
        if (distanceToPickup <= 15) { // 15km max
          this.io.to(`driver_${driver._id}`).emit('newRideRequest', {
            rideId: ride._id,
            user: {
              name: ride.userName,
              rating: 5 // Default rating if not available
            },
            pickup: {
              address: ride.pickup?.address || '',
              latitude: pickupCoords[1],
              longitude: pickupCoords[0]
            },
            destination: {
              address: ride.destination?.address || ''
            },
            fare: ride.fare,
            distance: ride.distance,
            distanceToPickup: parseFloat(distanceToPickup.toFixed(2)),
            estimatedTimeMinutes: Math.round(distanceToPickup * 3), // 3 min per km
            vehicleType: ride.vehicleType,
            createdAt: ride.createdAt
          });
          
          logger.debug(`Notified driver ${driver._id} about ride ${ride._id}`);
        }
      }
      
      return nearbyDrivers.length;
    } catch (error) {
      logger.error(`Error notifying drivers about ride: ${error.message}`);
      return 0;
    }
  }
}

module.exports = SocketService;