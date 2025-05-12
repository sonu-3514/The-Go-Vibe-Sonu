const Ride = require('../models/ride.model');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const Vehicle = require('../models/vehicle.model');
const geocoder = require('../utils/geocoder');
const { calculateDistance } = require('../utils/distance');
const logger = require('../utils/logger');
const { emitToUser, emitToDriver, notifyDriversOfNewRide } = require('../utils/socket.util');
const { io } = require('../app');
const mongoose = require('mongoose');

class RideController {
    static async estimateFare(req, res) {
        try {
            logger.info('Executing updated estimateFare method'); // Debug to confirm version
            const { pickup, destination, vehicleType = 'Mini' } = req.body;

            // Input validation
            if (!pickup || !destination) {
                logger.error('Missing pickup or destination', { pickup, destination });
                return res.status(400).json({
                    success: false,
                    message: 'Pickup and destination addresses are required',
                });
            }

            // Geocoding
            let pickupCoords, destinationCoords;
            try {
                logger.debug('Starting geocoding', { pickup, destination });
                pickupCoords = await geocoder.geocode(pickup);
                destinationCoords = await geocoder.geocode(destination);

                // Debug geocoding results
                logger.debug('Geocoding results', { pickupCoords, destinationCoords });

                // Validate geocoding results
                if (!pickupCoords || typeof pickupCoords.lat !== 'number' || typeof pickupCoords.lng !== 'number') {
                    logger.error('Invalid pickup coordinates', { pickupCoords });
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid pickup address or coordinates',
                    });
                }
                if (!destinationCoords || typeof destinationCoords.lat !== 'number' || typeof destinationCoords.lng !== 'number') {
                    logger.error('Invalid destination coordinates', { destinationCoords });
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid destination address or coordinates',
                    });
                }
            } catch (error) {
                logger.error('Geocoding error', { error: error.message, pickup, destination });
                return res.status(400).json({
                    success: false,
                    message: 'Error geocoding addresses',
                    error: error.message,
                });
            }

            // Calculate distance
            const dist = calculateDistance(
                pickupCoords.lat,
                pickupCoords.lng,
                destinationCoords.lat,
                destinationCoords.lng
            );
            logger.debug('Distance calculated', { distance: dist });

            // Calculate fare
            const baseFare = vehicleType === '' ? 50 : 80;
            const ratePerKm = vehicleType === '' ? 12 : 18;
            const fare = baseFare + ratePerKm * dist;

            const durationMinutes = Math.round(dist * 2);

            // Return response
            return res.status(200).json({
                success: true,
                data: {
                    distance: parseFloat(dist.toFixed(2)),
                    duration: durationMinutes,
                    fare: Math.round(fare),
                    vehicleType,
                    pickup: {
                        address: pickup,
                        coordinates: [pickupCoords.lng, pickupCoords.lat],
                    },
                    destination: {
                        address: destination,
                        coordinates: [destinationCoords.lng, destinationCoords.lat],
                    },
                },
            });
        } catch (error) {
            logger.error('Error estimating fare', { error: error.message, requestBody: req.body });
            return res.status(500).json({
                success: false,
                message: 'Error estimating fare',
                error: error.message,
            });
        }
    }

    static async requestRide(req, res) {
        try {
            logger.info('Executing updated requestRide method'); // Debug to confirm version
            const { pickup, destination, vehicleType = 'Mini', paymentMethod, userProposedFare, specialInstructions } = req.body;
            const userId = req.user._id;

            // Input validation
            if (!pickup || !destination || !paymentMethod) {
                logger.error('Missing required fields', { pickup, destination, paymentMethod });
                return res.status(400).json({
                    success: false,
                    message: 'Pickup, destination, and payment method are required',
                });
            }

            // Check for active ride
            const activeRide = await Ride.findOne({
                userId,
                status: { $in: ['pending', 'accepted', 'confirmed', 'arrived', 'started'] },
            });

            if (activeRide) {
                logger.warn('User has active ride', { userId, rideId: activeRide._id });
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active ride',
                    data: { rideId: activeRide._id },
                });
            }

            // Geocoding
            let pickupCoords, destinationCoords;
            try {
                logger.debug('Starting geocoding', { pickup, destination });
                pickupCoords = await geocoder.geocode(pickup);
                destinationCoords = await geocoder.geocode(destination);

                // Debug geocoding results
                logger.debug('Geocoding results', { pickupCoords, destinationCoords });

                // Validate geocoding results
                if (!pickupCoords || typeof pickupCoords.lat !== 'number' || typeof pickupCoords.lng !== 'number') {
                    logger.error('Invalid pickup coordinates', { pickupCoords });
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid pickup address or coordinates',
                    });
                }
                if (!destinationCoords || typeof destinationCoords.lat !== 'number' || typeof destinationCoords.lng !== 'number') {
                    logger.error('Invalid destination coordinates', { destinationCoords });
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid destination address or coordinates',
                    });
                }
            } catch (error) {
                logger.error('Geocoding error', { error: error.message, pickup, destination });
                return res.status(400).json({
                    success: false,
                    message: 'Error geocoding addresses',
                    error: error.message,
                });
            }

            // Calculate distance
            const dist = calculateDistance(
                pickupCoords.lat,
                pickupCoords.lng,
                destinationCoords.lat,
                destinationCoords.lng
            );
            logger.debug('Distance calculated', { distance: dist });

            // Calculate fares
            const baseFare = vehicleType === 'Mini' ? 50 : 80;
            const ratePerKm = vehicleType === 'Mini' ? 12 : 18;
            const estimatedFare = baseFare + ratePerKm * dist;

            // Create ride
            const ride = new Ride({
                userId,
                pickupLocation: {
                    address: pickup,
                    lat: pickupCoords.lat,
                    lng: pickupCoords.lng,
                    coordinates: [pickupCoords.lng, pickupCoords.lat],
                    type: 'Point',
                },
                dropoffLocation: {
                    address: destination,
                    lat: destinationCoords.lat,
                    lng: destinationCoords.lng,
                    coordinates: [destinationCoords.lng, destinationCoords.lat],
                    type: 'Point',
                },
                distance: parseFloat(dist.toFixed(2)),
                estimatedFare: Math.round(estimatedFare),
                userProposedFare: userProposedFare || Math.round(estimatedFare),
                vehicleType,
                paymentMethod,
                status: 'pending',
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            });

            await ride.save();
            logger.info('Ride created', { rideId: ride._id });

            // Notify nearby drivers
            notifyDriversOfNewRide(ride);

            return res.status(201).json({
                success: true,
                message: 'Ride requested successfully',
                data: {
                    ride: {
                        id: ride._id,
                        pickup: ride.pickupLocation.address,
                        destination: ride.dropoffLocation.address,
                        distance: ride.distance,
                        estimatedFare: ride.estimatedFare,
                        userProposedFare: ride.userProposedFare,
                        status: ride.status,
                        vehicleType,
                        expiresAt: ride.expiresAt,
                        specialInstructions,
                    },
                },
            });
        } catch (error) {
            logger.error('Error requesting ride', { error: error.message, requestBody: req.body });
            return res.status(500).json({
                success: false,
                message: 'Error requesting ride',
                error: error.message,
            });
        }
    }

    // Other methods remain unchanged
    static async acceptRide(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { rideId } = req.body;
            if (!rideId) {
                logger.error('Ride ID missing in request body');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID is required',
                });
            }

            // Validate ObjectId
            if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(driverId)) {
                logger.error('Invalid ride ID or driver ID', { rideId, driverId });
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ride ID or driver ID',
                });
            }

            const driver = await Driver.findById(driverId);
            if (!driver) {
                logger.error('Driver not found:', driverId);
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found',
                });
            }

            if (driver.status !== 'online') {
                logger.error(`Driver is not online. Current status: ${driver.status}`);
                return res.status(400).json({
                    success: false,
                    message: `Driver must be online to accept rides. Current status: ${driver.status}`,
                });
            }

            if (driver.currentRideId) {
                logger.error('Driver is already assigned to another ride:', driver.currentRideId);
                return res.status(400).json({
                    success: false,
                    message: 'Driver is already assigned to another ride',
                });
            }

            const ride = await Ride.findById(rideId);
            if (!ride) {
                logger.error('Ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }

            if (ride.status !== 'pending') {
                logger.error(`Ride is not pending. Current status: ${ride.status}`);
                return res.status(400).json({
                    success: false,
                    message: `Cannot accept ride with status: ${ride.status}`,
                });
            }

            if (ride.isExpired || (ride.expiresAt && ride.expiresAt < new Date())) {
                ride.isExpired = true;
                ride.status = 'expired';
                await ride.save();
                logger.error('Ride is expired:', rideId);
                return res.status(400).json({
                    success: false,
                    message: 'Ride has expired',
                });
            }

            if (ride.driverId && ride.driverId.toString() !== driverId.toString()) {
                logger.error('Ride already assigned to another driver:', ride.driverId);
                return res.status(400).json({
                    success: false,
                    message: 'Ride is already assigned to another driver',
                });
            }

            const userData = {
                id: ride.userId ? ride.userId.toString() : 'unknown',
                name: ride.userName || 'User',
                phone: ride.userPhone || 'Unknown',
                photo: ride.userPhoto || null,
                rating: ride.userRating || 5,
            };

            ride.status = 'accepted';
            ride.driverId = driverId;
            ride.driverName = driver.name || 'Unknown';
            ride.driverPhone = driver.phone || 'Unknown';
            ride.driverPhoto = driver.profilePhoto || null;
            ride.acceptedAt = new Date();

            if (!Array.isArray(ride.acceptedDrivers)) {
                ride.acceptedDrivers = [];
            }

            const driverAlreadyAccepted = ride.acceptedDrivers.some(
                (d) => d.driverId && d.driverId.toString() === driverId.toString()
            );

            if (!driverAlreadyAccepted) {
                ride.acceptedDrivers.push({
                    driverId,
                    driverDetails: {
                        name: driver.name || 'Unknown',
                        phone: driver.phone || 'Unknown',
                        vehicleDetails: driver.vehicleDetails || {
                            type: driver.vehicleType || 'Standard',
                            model: driver.vehicleModel || 'Unknown',
                            color: driver.vehicleColor || 'Unknown',
                            licensePlate: driver.vehicleNumber || 'Unknown',
                        },
                        rating: driver.rating || 5,
                        photo: driver.profilePhoto || null,
                    },
                    acceptedAt: new Date(),
                });
            }

            driver.currentRideId = rideId;
            driver.status = 'busy';

            try {
                await ride.save();
                try {
                    await driver.save({ validateBeforeSave: false });
                } catch (driverError) {
                    logger.error('Error saving driver:', driverError);
                    // Rollback ride changes
                    ride.status = 'pending';
                    ride.driverId = undefined;
                    ride.driverName = undefined;
                    ride.driverPhone = undefined;
                    ride.driverPhoto = undefined;
                    ride.acceptedAt = undefined;
                    ride.acceptedDrivers = ride.acceptedDrivers.filter(
                        (d) => d.driverId.toString() !== driverId.toString()
                    );
                    await ride.save();
                    return res.status(500).json({
                        success: false,
                        message: 'Error updating driver status',
                        error: driverError.message,
                    });
                }
            } catch (rideError) {
                logger.error('Error saving ride:', rideError);
                return res.status(500).json({
                    success: false,
                    message: 'Error updating ride',
                    error: rideError.message,
                });
            }

            logger.debug(`Ride ${rideId} accepted by driver ${driverId}`);

            emitToUser(ride.userId.toString(), 'rideAccepted', {
                rideId: ride._id,
                driver: {
                    id: driver._id,
                    name: driver.name,
                    phone: driver.phone,
                    vehicleDetails: driver.vehicleDetails,
                    rating: driver.rating || 5,
                    photo: driver.profilePhoto,
                },
                action: 'confirmDriver',
                message: 'A driver has accepted your ride. Please confirm to proceed.',
            });

            return res.status(200).json({
                success: true,
                message: 'Ride accepted successfully',
                data: {
                    ride: {
                        id: ride._id,
                        status: ride.status,
                        pickup: ride.pickupLocation?.address || 'Unknown',
                        destination: ride.dropoffLocation?.address || 'Unknown',
                        fare: ride.estimatedFare || 0,
                        distance: ride.distance || 0,
                        user: userData,
                    },
                },
            });
        } catch (error) {
            logger.error('Error in acceptRide:', error);
            return res.status(500).json({
                success: false,
                message: 'Error accepting ride',
                error: error.message,
            });
        }
    }

    static async rejectRide(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { rideId, reason } = req.body;
            if (!rideId) {
                logger.error('Ride ID missing in request body');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID is required',
                });
            }

            const ride = await Ride.findById(rideId);
            if (!ride) {
                logger.error('Ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }

            if (ride.status !== 'pending') {
                logger.error(`Cannot reject ride in ${ride.status} status`);
                return res.status(400).json({
                    success: false,
                    message: `Cannot reject ride in ${ride.status} status`,
                });
            }

            if (!Array.isArray(ride.rejectedDrivers)) {
                ride.rejectedDrivers = [];
            }

            if (!ride.rejectedDrivers.includes(driverId)) {
                ride.rejectedDrivers.push(driverId);
            }

            if (Array.isArray(ride.acceptedDrivers)) {
                ride.acceptedDrivers = ride.acceptedDrivers.filter(
                    (d) => d.driverId.toString() !== driverId.toString()
                );
            }

            await ride.save();
            logger.info(`Driver ${driverId} rejected ride ${rideId}`);

            return res.status(200).json({
                success: true,
                message: 'Ride rejected successfully',
                data: { rideId },
            });
        } catch (error) {
            logger.error('Error rejecting ride:', error);
            return res.status(500).json({
                success: false,
                message: 'Error rejecting ride',
                error: error.message,
            });
        }
    }

    static async confirmDriver(req, res) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                logger.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { rideId, driverId } = req.body;
            if (!rideId || !driverId) {
                logger.error('Ride ID and driver ID are required');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID and driver ID are required',
                });
            }

            // Validate ObjectIds
            if (!mongoose.Types.ObjectId.isValid(rideId) || !mongoose.Types.ObjectId.isValid(driverId)) {
                logger.error('Invalid ride ID or driver ID', { rideId, driverId });
                return res.status(400).json({
                    success: false,
                    message: 'Invalid ride ID or driver ID',
                });
            }

            const ride = await Ride.findOne({
                _id: rideId,
                userId,
                status: 'accepted',
                isExpired: { $ne: true },
            });

            if (!ride) {
                logger.error('Accepted ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Accepted ride not found',
                });
            }

            if (ride.expiresAt && ride.expiresAt < new Date()) {
                ride.isExpired = true;
                ride.status = 'expired';
                await ride.save();
                logger.error('Ride has expired:', rideId);
                return res.status(400).json({
                    success: false,
                    message: 'This ride request has expired. Please create a new request.',
                });
            }

            const isDriverAccepted =
                Array.isArray(ride.acceptedDrivers) &&
                ride.acceptedDrivers.some((d) => d.driverId.toString() === driverId.toString());

            if (!isDriverAccepted || !ride.driverId || ride.driverId.toString() !== driverId.toString()) {
                logger.error('Driver is not assigned to this ride:', { driverId, rideDriverId: ride.driverId });
                return res.status(400).json({
                    success: false,
                    message: 'Driver is not assigned to this ride',
                });
            }

            const driver = await Driver.findById(driverId);
            if (!driver) {
                logger.error('Driver not found:', driverId);
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found',
                });
            }

            // Log driver state for debugging
            logger.debug(`Driver state: status=${driver.status}, currentRideId=${driver.currentRideId}`);

            ride.status = 'confirmed';
            ride.confirmedAt = new Date();

            await ride.save();

            emitToDriver(driverId.toString(), 'rideConfirmed', {
                rideId: ride._id,
                user: {
                    id: userId,
                    name: ride.userName || 'User',
                    phone: ride.userPhone,
                },
                pickup: ride.pickupLocation.address,
                destination: ride.dropoffLocation.address,
                fare: ride.estimatedFare,
                status: ride.status,
            });

            emitToUser(userId.toString(), 'rideStatusUpdated', {
                rideId: ride._id,
                status: ride.status,
                message: 'Driver confirmed successfully',
            });

            // Notify other drivers
            if (Array.isArray(ride.acceptedDrivers)) {
                for (const acceptedDriver of ride.acceptedDrivers) {
                    if (acceptedDriver.driverId.toString() !== driverId.toString()) {
                        emitToDriver(acceptedDriver.driverId.toString(), 'rideNoLongerAvailable', {
                            rideId: ride._id,
                            message: 'Ride was assigned to another driver',
                        });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Driver confirmed successfully',
                data: {
                    ride: {
                        id: ride._id,
                        status: ride.status,
                        fare: ride.estimatedFare,
                    },
                    driver: {
                        id: driver._id,
                        name: driver.name,
                        phone: driver.phone,
                        vehicleDetails: driver.vehicleDetails,
                        currentLocation: driver.currentLocation,
                    },
                },
            });
        } catch (error) {
            logger.error('Error confirming driver:', error);
            return res.status(500).json({
                success: false,
                message: 'Error confirming driver',
                error: error.message,
            });
        }
    }

    static async updateRideStatus(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { rideId, status, finalFare, reason } = req.body;
            if (!rideId || !status) {
                logger.error('Ride ID and status are required');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID and status are required',
                });
            }

            const validStatuses = ['accepted', 'confirmed', 'arrived', 'started', 'completed', 'cancelled'];
            if (!validStatuses.includes(status)) {
                logger.error('Invalid status:', status);
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
                });
            }

            const ride = await Ride.findById(rideId);
            if (!ride) {
                logger.error('Ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }

            if (!ride.driverId || ride.driverId.toString() !== driverId.toString()) {
                logger.error('Driver not assigned to ride:', { driverId, rideDriverId: ride.driverId });
                return res.status(403).json({
                    success: false,
                    message: 'Only the assigned driver can update this ride status',
                });
            }

            // Enforce confirmation before starting or arriving
            if (['started', 'arrived'].includes(status) && ride.status !== 'confirmed') {
                logger.error('Ride must be confirmed before starting or arriving:', ride.status);
                return res.status(400).json({
                    success: false,
                    message: 'Ride must be confirmed by the user before starting or arriving',
                });
            }

            const statusTransitions = {
                pending: ['accepted', 'cancelled'],
                accepted: ['confirmed', 'cancelled'],
                confirmed: ['arrived', 'started', 'cancelled'],
                arrived: ['started', 'cancelled'],
                started: ['completed', 'cancelled'],
                completed: [],
                cancelled: [],
            };

            if (!statusTransitions[ride.status]?.includes(status)) {
                logger.error('Invalid status transition:', { current: ride.status, requested: status });
                return res.status(400).json({
                    success: false,
                    message: `Cannot transition from ${ride.status} to ${status}`,
                });
            }

            const driver = await Driver.findById(driverId);
            if (!driver) {
                logger.error('Driver not found:', driverId);
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found',
                });
            }

            ride.status = status;

            if (status === 'accepted') ride.acceptedAt = new Date();
            if (status === 'confirmed') ride.confirmedAt = new Date();
            if (status === 'arrived') ride.arrivedAt = new Date();
            if (status === 'started') ride.startedAt = new Date();
            if (status === 'completed') {
                ride.completedAt = new Date();
                ride.finalFare = finalFare || ride.estimatedFare;
                ride.paymentStatus = 'pending';
                driver.currentRideId = null;
                driver.status = 'online';
                if (!driver.earnings) {
                    driver.earnings = { today: 0, week: 0, month: 0, total: 0 };
                }
                const fare = ride.finalFare || ride.estimatedFare || 0;
                driver.earnings.today += fare;
                driver.earnings.week += fare;
                driver.earnings.month += fare;
                driver.earnings.total += fare;
            }
            if (status === 'cancelled') {
                ride.cancelledAt = new Date();
                ride.cancellationReason = reason || 'Cancelled by driver';
                ride.cancelledBy = 'driver';
                driver.currentRideId = null;
                driver.status = 'online';
            }

            try {
                await ride.save();
                await driver.save({ validateBeforeSave: false });
            } catch (error) {
                logger.error('Error saving ride or driver:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error updating ride status',
                    error: error.message,
                });
            }

            emitToUser(ride.userId.toString(), 'rideStatusUpdated', {
                rideId: ride._id,
                status: ride.status,
                driverId,
                timestamp: new Date(),
                message: `Ride status updated to ${status}`,
            });

            emitToDriver(driverId.toString(), 'rideStatusUpdated', {
                rideId: ride._id,
                status: ride.status,
                timestamp: new Date(),
                message: `Ride status updated to ${status}`,
            });

            return res.status(200).json({
                success: true,
                message: `Ride status updated to ${status}`,
                data: {
                    ride: {
                        id: ride._id,
                        status: ride.status,
                        pickup: ride.pickupLocation?.address || 'Unknown',
                        destination: ride.dropoffLocation?.address || 'Unknown',
                        fare: ride.finalFare || ride.estimatedFare || 0,
                        distance: ride.distance || 0,
                    },
                },
            });
        } catch (error) {
            logger.error('Error updating ride status:', error);
            return res.status(500).json({
                success: false,
                message: 'Error updating ride status',
                error: error.message,
            });
        }
    }
    static async cancelRide(req, res) {
      try {
          // Check for user or driver authentication
          const userId = req.user?._id;
          const driverId = req.driver?._id;
          if (!userId && !driverId) {
              logger.error('No user or driver ID found in request');
              return res.status(401).json({
                  success: false,
                  message: 'Authentication required. Please login again.',
              });
          }
  
          const { rideId, reason } = req.body;
          if (!rideId) {
              logger.error('Ride ID is required');
              return res.status(400).json({
                  success: false,
                  message: 'Ride ID is required',
              });
          }
  
          // Validate ObjectId
          if (!mongoose.Types.ObjectId.isValid(rideId)) {
              logger.error('Invalid ride ID', { rideId });
              return res.status(400).json({
                  success: false,
                  message: 'Invalid ride ID',
              });
          }
  
          const ride = await Ride.findById(rideId);
          if (!ride) {
              logger.error('Ride not found:', rideId);
              return res.status(404).json({
                  success: false,
                  message: 'Ride not found',
              });
          }
  
          // Check authorization: user or driver
          const isUser = userId && ride.userId?.toString() === userId.toString();
          const isDriver = driverId && ride.driverId?.toString() === driverId.toString();
          if (!isUser && !isDriver) {
              logger.error('Not authorized to cancel ride', { userId, driverId, rideUserId: ride.userId, rideDriverId: ride.driverId });
              return res.status(403).json({
                  success: false,
                  message: 'You do not have permission to cancel this ride',
              });
          }
  
          const cancellableStatuses = ['pending', 'accepted', 'arrived'];
          if (!cancellableStatuses.includes(ride.status)) {
              logger.error(`Cannot cancel ride with status: ${ride.status}`);
              return res.status(400).json({
                  success: false,
                  message: `Cannot cancel ride with status: ${ride.status}`,
              });
          }
  
          ride.status = 'cancelled';
          ride.cancelledAt = new Date();
          ride.cancellationReason = reason || `Cancelled by ${isUser ? 'user' : 'driver'}`;
          ride.cancelledBy = isUser ? 'user' : 'driver';
  
          let driver;
          if (ride.driverId && isUser) {
              // If user cancels, update driver
              driver = await Driver.findById(ride.driverId);
              if (driver) {
                  driver.currentRideId = null;
                  driver.status = 'online';
              }
          } else if (isDriver) {
              // If driver cancels, update their own status
              driver = await Driver.findById(driverId);
              if (driver) {
                  driver.currentRideId = null;
                  driver.status = 'online';
              }
          }
  
          try {
              await ride.save();
              if (driver) {
                  await driver.save({ validateBeforeSave: false });
              }
          } catch (error) {
              logger.error('Error saving ride or driver:', error);
              return res.status(500).json({
                  success: false,
                  message: 'Error cancelling ride',
                  error: error.message,
              });
          }
  
          // Notify the other party
          if (isUser && ride.driverId) {
              emitToDriver(ride.driverId.toString(), 'rideCancelled', {
                  rideId: ride._id,
                  message: 'Ride has been cancelled by the user',
                  timestamp: new Date(),
              });
          } else if (isDriver && ride.userId) {
              emitToUser(ride.userId.toString(), 'rideCancelled', {
                  rideId: ride._id,
                  message: 'Ride has been cancelled by the driver',
                  timestamp: new Date(),
              });
          }
  
          return res.status(200).json({
              success: true,
              message: 'Ride cancelled successfully',
              data: {
                  rideId: ride._id,
                  status: ride.status,
                  cancelledAt: ride.cancelledAt,
                  cancellationReason: ride.cancellationReason,
              },
          });
      } catch (error) {
          logger.error('Error cancelling ride:', error);
          return res.status(500).json({
              success: false,
              message: 'Error cancelling ride',
              error: error.message,
          });
      }
  }
    static async getUserActiveRide(req, res) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                logger.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const activeRide = await Ride.findOne({
                userId,
                status: { $in: ['pending', 'accepted', 'confirmed', 'arrived', 'started'] },
            }).populate('driverId', 'name phone rating vehicleDetails currentLocation profilePhoto');

            if (!activeRide) {
                return res.status(404).json({
                    success: false,
                    message: 'No active ride found',
                });
            }

            if (activeRide.status === 'pending' && activeRide.expiresAt && activeRide.expiresAt < new Date()) {
                activeRide.isExpired = true;
                activeRide.status = 'expired';
                await activeRide.save();
                return res.status(400).json({
                    success: false,
                    message: 'Your ride request has expired. Please request a new ride.',
                });
            }

            const response = {
                rideId: activeRide._id,
                status: activeRide.status,
                pickup: activeRide.pickupLocation?.address || 'Unknown',
                destination: activeRide.dropoffLocation?.address || 'Unknown',
                fare: activeRide.estimatedFare || 0,
                distance: activeRide.distance || 0,
                createdAt: activeRide.createdAt,
            };

            if (activeRide.status === 'pending' && activeRide.expiresAt) {
                const timeRemainingMs = new Date(activeRide.expiresAt) - new Date();
                response.expiresIn = Math.max(0, Math.ceil(timeRemainingMs / 60000));
            }

            if (activeRide.status !== 'pending' && activeRide.driverId) {
                const driverLocation = activeRide.driverId.currentLocation?.coordinates || [0, 0];
                response.driver = {
                    id: activeRide.driverId._id,
                    name: activeRide.driverId.name,
                    phone: activeRide.driverId.phone,
                    rating: activeRide.driverId.rating || 5,
                    photo: activeRide.driverId.profilePhoto,
                    vehicleDetails: activeRide.driverId.vehicleDetails,
                    currentLocation: {
                        latitude: driverLocation[1],
                        longitude: driverLocation[0],
                    },
                };
            } else if (activeRide.status === 'pending' && Array.isArray(activeRide.acceptedDrivers) && activeRide.acceptedDrivers.length > 0) {
                response.availableDrivers = await Promise.all(
                    activeRide.acceptedDrivers.map(async (driver) => {
                        try {
                            const driverDetails = await Driver.findById(driver.driverId).select(
                                'name phone rating profilePhoto vehicleDetails currentLocation'
                            );
                            if (!driverDetails) return null;
                            const driverLocation = driverDetails.currentLocation?.coordinates || [0, 0];
                            return {
                                id: driverDetails._id,
                                name: driverDetails.name,
                                phone: driverDetails.phone,
                                rating: driverDetails.rating || 5,
                                photo: driverDetails.profilePhoto,
                                vehicleDetails: driverDetails.vehicleDetails,
                                currentLocation: {
                                    latitude: driverLocation[1],
                                    longitude: driverLocation[0],
                                },
                                acceptedAt: driver.acceptedAt,
                            };
                        } catch (error) {
                            logger.error(`Error getting driver details: ${error.message}`);
                            return null;
                        }
                    })
                );
                response.availableDrivers = response.availableDrivers.filter((d) => d !== null);
            }

            return res.status(200).json({
                success: true,
                data: response,
            });
        } catch (error) {
            logger.error('Error getting user active ride:', error);
            return res.status(500).json({
                success: false,
                message: 'Error getting active ride',
                error: error.message,
            });
        }
    }

    static async getDriverActiveRide(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const activeRide = await Ride.findOne({
                driverId,
                status: { $in: ['accepted', 'confirmed', 'arrived', 'started'] },
            }).populate('userId', 'name phone rating profilePhoto');

            if (!activeRide) {
                return res.status(404).json({
                    success: false,
                    message: 'No active ride found',
                });
            }

            const response = {
                rideId: activeRide._id,
                status: activeRide.status,
                pickup: activeRide.pickupLocation?.address || 'Unknown',
                destination: activeRide.dropoffLocation?.address || 'Unknown',
                fare: activeRide.estimatedFare || 0,
                distance: activeRide.distance || 0,
                user: {
                    id: activeRide.userId._id,
                    name: activeRide.userId.name,
                    phone: activeRide.userId.phone,
                    rating: activeRide.userId.rating || 5,
                    photo: activeRide.userId.profilePhoto,
                },
                timestamps: {
                    created: activeRide.createdAt,
                    accepted: activeRide.acceptedAt,
                    arrived: activeRide.arrivedAt,
                    started: activeRide.startedAt,
                },
            };

            return res.status(200).json({
                success: true,
                data: response,
            });
        } catch (error) {
            logger.error('Error getting driver active ride:', error);
            return res.status(500).json({
                success: false,
                message: 'Error getting active ride',
                error: error.message,
            });
        }
    }

    static async getAvailableRides(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const driver = await Driver.findById(driverId);
            if (!driver) {
                logger.error('Driver not found:', driverId);
                return res.status(404).json({
                    success: false,
                    message: 'Driver not found',
                });
            }

            if (driver.status !== 'online') {
                logger.error('Driver must be online to view available rides:', driver.status);
                return res.status(400).json({
                    success: false,
                    message: 'Driver must be online to view available rides',
                });
            }

            const rides = await Ride.find({
                status: 'pending',
                isExpired: false,
                expiresAt: { $gt: new Date() },
                vehicleType: driver.vehicleDetails?.type || driver.vehicleType || 'Mini',
                pickupLocation: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: driver.currentLocation?.coordinates || [0, 0],
                        },
                        $maxDistance: 10000,
                    },
                },
            }).limit(10);

            const formattedRides = rides.map((ride) => ({
                id: ride._id,
                pickup: ride.pickupLocation?.address || 'Unknown',
                destination: ride.dropoffLocation?.address || 'Unknown',
                distance: ride.distance || 0,
                fare: ride.estimatedFare || 0,
                vehicleType: ride.vehicleType,
            }));

            return res.status(200).json({
                success: true,
                message: 'Available rides retrieved successfully',
                data: formattedRides,
            });
        } catch (error) {
            logger.error('Error retrieving available rides:', error);
            return res.status(500).json({
                success: false,
                message: 'Error retrieving available rides',
                error: error.message,
            });
        }
    }

    static async getUserRideHistory(req, res) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                logger.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { page = 1, limit = 10 } = req.query;
            const skip = (page - 1) * limit;

            const rides = await Ride.find({
                userId,
                status: { $in: ['completed', 'cancelled', 'expired'] },
            })
                .populate('driverId', 'name rating profilePhoto vehicleDetails')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Ride.countDocuments({
                userId,
                status: { $in: ['completed', 'cancelled', 'expired'] },
            });

            const formattedRides = rides.map((ride) => ({
                id: ride._id,
                pickup: ride.pickupLocation?.address || 'Unknown',
                destination: ride.dropoffLocation?.address || 'Unknown',
                fare: ride.finalFare || ride.estimatedFare || 0,
                distance: ride.distance || 0,
                status: ride.status,
                createdAt: ride.createdAt,
                completedAt: ride.completedAt,
                cancelledAt: ride.cancelledAt,
                driver: ride.driverId
                    ? {
                          id: ride.driverId._id,
                          name: ride.driverId.name,
                          rating: ride.driverId.rating || 5,
                          photo: ride.driverId.profilePhoto,
                          vehicleDetails: ride.driverId.vehicleDetails,
                      }
                    : null,
            }));

            return res.status(200).json({
                success: true,
                data: {
                    rides: formattedRides,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit),
                    },
                },
            });
        } catch (error) {
            logger.error('Error getting user ride history:', error);
            return res.status(500).json({
                success: false,
                message: 'Error getting ride history',
                error: error.message,
            });
        }
    }

    static async getDriverRideHistory(req, res) {
        try {
            const driverId = req.driver?._id || req.user?._id;
            if (!driverId) {
                logger.error('No driver ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { page = 1, limit = 10 } = req.query;
            const skip = (page - 1) * limit;

            const rides = await Ride.find({
                driverId,
                status: { $in: ['completed', 'cancelled'] },
            })
                .populate('userId', 'name rating profilePhoto')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Ride.countDocuments({
                driverId,
                status: { $in: ['completed', 'cancelled'] },
            });

            const formattedRides = rides.map((ride) => ({
                id: ride._id,
                pickup: ride.pickupLocation?.address || 'Unknown',
                destination: ride.dropoffLocation?.address || 'Unknown',
                fare: ride.finalFare || ride.estimatedFare || 0,
                distance: ride.distance || 0,
                status: ride.status,
                createdAt: ride.createdAt,
                completedAt: ride.completedAt,
                cancelledAt: ride.cancelledAt,
                user: ride.userId
                    ? {
                          id: ride.userId._id,
                          name: ride.userId.name,
                          rating: ride.userId.rating || 5,
                          photo: ride.userId.profilePhoto,
                      }
                    : null,
            }));

            return res.status(200).json({
                success: true,
                data: {
                    rides: formattedRides,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit),
                    },
                },
            });
        } catch (error) {
            logger.error('Error getting driver ride history:', error);
            return res.status(500).json({
                success: false,
                message: 'Error getting ride history',
                error: error.message,
            });
        }
    }

    static async getRideDetails(req, res) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                logger.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { id: rideId } = req.params;
            if (!rideId) {
                logger.error('Ride ID is required');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID is required',
                });
            }

            const ride = await Ride.findById(rideId)
                .populate('userId', 'name phone rating profilePhoto')
                .populate('driverId', 'name phone rating profilePhoto vehicleDetails currentLocation');

            if (!ride) {
                logger.error('Ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Ride not found',
                });
            }

            const isUser = ride.userId?._id.toString() === userId.toString();
            const isDriver = ride.driverId?._id.toString() === userId.toString();

            if (!isUser && !isDriver) {
                logger.error('Not authorized to view ride:', { userId, rideId });
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to view this ride',
                });
            }

            const response = {
                id: ride._id,
                status: ride.status,
                pickup: ride.pickupLocation?.address || 'Unknown',
                destination: ride.dropoffLocation?.address || 'Unknown',
                fare: ride.finalFare || ride.estimatedFare || 0,
                distance: ride.distance || 0,
                paymentMethod: ride.paymentMethod,
                createdAt: ride.createdAt,
                timestamps: {
                    accepted: ride.acceptedAt,
                    arrived: ride.arrivedAt,
                    started: ride.startedAt,
                    completed: ride.completedAt,
                    cancelled: ride.cancelledAt,
                },
            };

            if (isDriver && ride.userId) {
                response.user = {
                    id: ride.userId._id,
                    name: ride.userId.name,
                    phone: ride.userId.phone,
                    rating: ride.userId.rating || 5,
                    photo: ride.userId.profilePhoto,
                };
            }

            if (ride.driverId) {
                const driverLocation = ride.driverId.currentLocation?.coordinates || [0, 0];
                response.driver = {
                    id: ride.driverId._id,
                    name: ride.driverId.name,
                    phone: ride.driverId.phone,
                    rating: ride.driverId.rating || 5,
                    photo: ride.driverId.profilePhoto,
                    vehicleDetails: ride.driverId.vehicleDetails,
                    currentLocation: {
                        latitude: driverLocation[1],
                        longitude: driverLocation[0],
                    },
                };
            }

            return res.status(200).json({
                success: true,
                data: response,
            });
        } catch (error) {
            logger.error('Error getting ride details:', error);
            return res.status(500).json({
                success: false,
                message: 'Error getting ride details',
                error: error.message,
            });
        }
    }

    static async retryExpiredRide(req, res) {
        try {
            const userId = req.user?._id;
            if (!userId) {
                logger.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required. Please login again.',
                });
            }

            const { rideId } = req.body;
            if (!rideId) {
                logger.error('Ride ID is required');
                return res.status(400).json({
                    success: false,
                    message: 'Ride ID is required',
                });
            }

            const expiredRide = await Ride.findOne({
                _id: rideId,
                userId,
                status: 'expired',
                isExpired: true,
            });

            if (!expiredRide) {
                logger.error('Expired ride not found:', rideId);
                return res.status(404).json({
                    success: false,
                    message: 'Expired ride not found',
                });
            }

            const newRide = await Ride.create({
                userId: expiredRide.userId,
                userName: expiredRide.userName,
                userPhone: expiredRide.userPhone,
                userPhoto: expiredRide.userPhoto,
                userRating: expiredRide.userRating,
                pickupLocation: expiredRide.pickupLocation,
                dropoffLocation: expiredRide.dropoffLocation,
                distance: expiredRide.distance,
                estimatedFare: expiredRide.estimatedFare,
                userProposedFare: expiredRide.userProposedFare,
                vehicleType: expiredRide.vehicleType,
                paymentMethod: expiredRide.paymentMethod,
                status: 'pending',
                acceptedDrivers: [],
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                isExpired: false,
            });

            const pickupCoords = newRide.pickupLocation?.coordinates || [0, 0];
            const nearbyDrivers = await Driver.find({
                status: 'online',
                'vehicleDetails.type': newRide.vehicleType,
                currentLocation: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: pickupCoords,
                        },
                        $maxDistance: 10000,
                    },
                },
            }).limit(10);

            const formattedDrivers = nearbyDrivers.map((driver) => {
                const driverCoords = driver.currentLocation?.coordinates || [0, 0];
                const distanceToPickup = calculateDistance(
                    pickupCoords[1],
                    pickupCoords[0],
                    driverCoords[1],
                    driverCoords[0]
                );
                return {
                    id: driver._id,
                    name: driver.name,
                    vehicleDetails: driver.vehicleDetails,
                    rating: driver.rating || 5,
                    distanceToPickup: parseFloat(distanceToPickup.toFixed(2)),
                };
            });

            notifyDriversOfNewRide(newRide);

            return res.status(201).json({
                success: true,
                message: 'Ride retried successfully',
                data: {
                    ride: {
                        id: newRide._id,
                        pickup: newRide.pickupLocation.address,
                        destination: newRide.dropoffLocation.address,
                        distance: newRide.distance,
                        fare: newRide.estimatedFare,
                        status: newRide.status,
                        vehicleType: newRide.vehicleType,
                        expiresAt: newRide.expiresAt,
                    },
                    nearbyDrivers: formattedDrivers,
                },
            });
        } catch (error) {
            logger.error('Error retrying ride:', error);
            return res.status(500).json({
                success: false,
                message: 'Error retrying ride',
                error: error.message,
            });
        }
    }

    static async getNearbyDrivers(req, res) {
        try {
            const { latitude, longitude, vehicleType = 'all' } = req.body.latitude !== undefined ? req.body : req.query;
            if (!latitude || !longitude) {
                logger.error('Latitude and longitude are required');
                return res.status(400).json({
                    success: false,
                    message: 'Latitude and longitude are required',
                });
            }

            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
            if (isNaN(lat) || isNaN(lng)) {
                logger.error('Invalid latitude or longitude values');
                return res.status(400).json({
                    success: false,
                    message: 'Invalid latitude or longitude values',
                });
            }

            logger.debug(`Searching for nearby drivers at [${lat}, ${lng}] with vehicle type: ${vehicleType}`);

            const query = {
                status: 'online',
                currentLocation: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lng, lat],
                        },
                        $maxDistance: 10000,
                    },
                },
            };

            if (vehicleType !== 'all') {
                query['vehicleDetails.type'] = vehicleType;
            }

            const nearbyDrivers = await Driver.find(query)
                .select('_id name vehicleDetails currentLocation status rating profilePhoto')
                .limit(20);

            logger.info(`Found ${nearbyDrivers.length} nearby drivers`);

            const formattedDrivers = nearbyDrivers.map((driver) => {
                const coords = driver.currentLocation?.coordinates || [0, 0];
                const distance = calculateDistance(lat, lng, coords[1], coords[0]);
                return {
                    id: driver._id,
                    name: driver.name,
                    vehicleType: driver.vehicleDetails?.type || 'Unknown',
                    distance: parseFloat(distance.toFixed(2)),
                    location: {
                        latitude: coords[1],
                        longitude: coords[0],
                    },
                    rating: driver.rating || 5,
                    photo: driver.profilePhoto,
                };
            });

            formattedDrivers.sort((a, b) => a.distance - b.distance);

            return res.status(200).json({
                success: true,
                message: `Found ${formattedDrivers.length} nearby drivers`,
                data: {
                    drivers: formattedDrivers,
                },
            });
        } catch (error) {
            logger.error('Error finding nearby drivers:', error);
            return res.status(500).json({
                success: false,
                message: 'Error finding nearby drivers',
                error: error.message,
            });
        }
    }

    static async cleanupExpiredRides() {
        try {
            const now = new Date();
            const result = await Ride.updateMany(
                {
                    status: 'pending',
                    isExpired: { $ne: true },
                    expiresAt: { $lt: now },
                },
                {
                    $set: {
                        status: 'expired',
                        isExpired: true,
                    },
                }
            );

            if (result.modifiedCount > 0) {
                logger.info(`Marked ${result.modifiedCount} rides as expired`);
            }

            return result.modifiedCount;
        } catch (error) {
            logger.error('Error cleaning up expired rides:', error);
            return 0;
        }
    }
}

module.exports = RideController;