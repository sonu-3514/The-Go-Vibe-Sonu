const userService = require('../services/user.service');
const Driver = require('../models/driver.model');
const User = require('../models/user.model');
const Vehicle = require('../models/vehicle.model');
const logger = require('../utils/logger');
const { calculateDistance } = require('../utils/distance');

exports.completeRegistration = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userData = req.body;

    const user = await userService.completeRegistration(userId, userData);
    
    res.status(200).json({
      success: true,
      data: user,
      message: 'Registration completed successfully',
    });
  } catch (error) {
    logger.error('Error in completeRegistration:', error);
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await userService.getUserProfile(userId);
    
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Error in getProfile:', error);
    next(error);
  }
};

/**
 * Get user profile
 * @route GET /api/v1/users/profile
 */
exports.getUserProfile = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user) {
      logger.error('User not found in request');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        mobileNumber: user.mobileNumber,
        name: user.name || '',
        email: user.email || '',
        gender: user.gender || '',
        dob: user.dob || '',
        profilePhoto: user.profilePhoto || '',
        isRegistered: user.isRegistered || false,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Error getting user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving user profile',
      error: error.message
    });
  }
};

/**
 * Get nearby drivers
 * @route POST /api/v1/users/nearby-drivers
 */
exports.getNearbyDrivers = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      logger.error('Latitude and longitude are required');
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      logger.error('Invalid coordinates format');
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates format'
      });
    }
    
    logger.debug(`Searching for nearby drivers at [${lat}, ${lng}]`);
    
    const query = {
      status: 'online',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: 10000 // 10km
        }
      }
    };
    
    const drivers = await Driver.find(query)
      .select('name rating profilePhoto vehicleDetails currentLocation')
      .limit(20);
    
    const formattedDrivers = drivers.map(driver => {
      const driverCoords = driver.currentLocation?.coordinates || [0, 0];
      const distanceToUser = calculateDistance(lat, lng, driverCoords[1], driverCoords[0]);
      
      return {
        id: driver._id,
        name: driver.name,
        rating: driver.rating || 5,
        photo: driver.profilePhoto,
        vehicleDetails: driver.vehicleDetails || { type: 'Unknown' },
        distance: parseFloat(distanceToUser.toFixed(2)),
        estimatedTime: Math.round(distanceToUser * 3) // 3 min per km
      };
    });
    
    formattedDrivers.sort((a, b) => a.distance - b.distance);
    
    logger.info(`Found ${formattedDrivers.length} nearby drivers`);
    
    return res.status(200).json({
      success: true,
      count: formattedDrivers.length,
      data: formattedDrivers
    });
  } catch (error) {
    logger.error('Error finding nearby drivers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error finding nearby drivers',
      error: error.message
    });
  }
};

/**
 * Find drivers by specific vehicle type
 * @route POST /api/v1/users/drivers-by-vehicle-type
 */
exports.findDriversByVehicleType = async (req, res) => {
  try {
    const { latitude, longitude, vehicleType, radius = 10 } = req.body;
    
    if (!latitude || !longitude || !vehicleType) {
      logger.error('Latitude, longitude, and vehicleType are required');
      return res.status(400).json({
        success: false,
        message: 'Latitude, longitude, and vehicleType are required'
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      logger.error('Invalid coordinates format');
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates format'
      });
    }
    
    const radiusInMeters = radius * 1000;
    
    const query = {
      status: 'online',
      'vehicleDetails.type': vehicleType,
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: radiusInMeters
        }
      }
    };
    
    const drivers = await Driver.find(query)
      .select('_id name phone vehicleDetails currentLocation status')
      .limit(20);
    
    const driversWithDetails = drivers.map(driver => {
      const driverCoords = driver.currentLocation.coordinates;
      const distance = calculateDistance(lat, lng, driverCoords[1], driverCoords[0]);
      
      return {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleDetails?.type || 'Unknown',
        location: {
          latitude: driverCoords[1],
          longitude: driverCoords[0]
        },
        distance: parseFloat(distance.toFixed(2)),
        estimatedFare: calculateFare(determineFare(driver.vehicleDetails?.type), distance),
        estimatedArrivalTime: calculateETA(distance)
      };
    });
    
    driversWithDetails.sort((a, b) => a.distance - b.distance);
    
    return res.status(200).json({
      success: true,
      count: driversWithDetails.length,
      drivers: driversWithDetails
    });
  } catch (error) {
    logger.error('Error finding drivers by vehicle type:', error);
    return res.status(500).json({
      success: false,
      message: 'Error finding drivers',
      error: error.message
    });
  }
};

/**
 * Determine base fare by vehicle type
 * @param {string} vehicleType - Type of vehicle
 * @returns {number} Base fare in INR
 */
function determineFare(vehicleType) {
  switch (vehicleType) {
    case 'Rickshaw':
      return 30;
    case 'Mini':
      return 50;
    case 'Premium':
      return 100;
    case 'Premium+':
      return 150;
    default:
      return 50; // Default base fare
  }
}

/**
 * Calculate estimated fare based on distance and base fare
 * @param {number} baseFare - Base fare for the vehicle type
 * @param {number} distance - Distance in km
 * @returns {number} Estimated fare
 */
function calculateFare(baseFare, distance) {
  const ratePerKm = 10 // Rate per km in INR
  return parseFloat((baseFare + (distance * ratePerKm)).toFixed(1));
}

/**
 * Calculate estimated time of arrival based on distance
 * @param {number} distance - Distance in km
 * @returns {number} ETA in minutes
 */
function calculateETA(distance) {
  const averageSpeedKmPerHour = 30;
  return Math.ceil((distance / averageSpeedKmPerHour) * 60);
}

/**
 * Get vehicle types with count of available drivers
 * @route GET /api/v1/users/available-vehicle-types
 */
exports.getAvailableVehicleTypes = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    
    if (!latitude || !longitude) {
      logger.error('Latitude and longitude are required');
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      logger.error('Invalid coordinates format');
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates format'
      });
    }
    
    const radiusInMeters = radius * 1000;
    
    const drivers = await Driver.find({
      status: 'online',
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: radiusInMeters
        }
      }
    }).select('vehicleDetails');
    
    const vehicleTypeCounts = {};
    const availableVehicleTypes = [];
    
    drivers.forEach(driver => {
      const vehicleType = driver.vehicleDetails?.type || 'Unknown';
      
      if (!vehicleTypeCounts[vehicleType]) {
        vehicleTypeCounts[vehicleType] = 1;
        const baseFare = determineFare(vehicleType);
        availableVehicleTypes.push({
          type: vehicleType,
          count: 1,
          baseFare,
          displayName: getVehicleDisplayName(vehicleType)
        });
      } else {
        vehicleTypeCounts[vehicleType]++;
        const typeIndex = availableVehicleTypes.findIndex(item => item.type === vehicleType);
        if (typeIndex !== -1) {
          availableVehicleTypes[typeIndex].count++;
        }
      }
    });
    
    return res.status(200).json({
      success: true,
      availableVehicleTypes
    });
  } catch (error) {
    logger.error('Error getting available vehicle types:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting available vehicle types',
      error: error.message
    });
  }
};

/**
 * Get display name for vehicle type
 * @param {string} vehicleType - Type of vehicle
 * @returns {string} Display name
 */
function getVehicleDisplayName(vehicleType) {
  switch (vehicleType) {
    case 'Rickshaw':
      return 'Auto Rickshaw';
    case 'Mini':
      return 'Mini Car';
    case 'Premium':
      return 'Premium Car';
    case 'Premium+':
      return 'Luxury Car';
    default:
      return vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
  }
}

/**
 * Get active drivers
 * @route GET /api/v1/users/active-drivers
 */
exports.getActiveDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ status: 'online' })
      .select('_id name phone vehicleDetails')
      .limit(100);
    
    return res.status(200).json({
      success: true,
      count: drivers.length,
      drivers
    });
  } catch (error) {
    logger.error('Error getting active drivers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting active drivers',
      error: error.message
    });
  }
};

/**
 * Debug location queries
 * @route GET /api/v1/users/debug-location
 */
exports.debugLocationQueries = async (req, res) => {
  try {
    const latitude = req.query.latitude || req.body.latitude || 18.5204;
    const longitude = req.query.longitude || req.body.longitude || 73.8567;
    
    const indexInfo = await Driver.collection.indexInformation();
    const hasCurrentLocationIndex = Object.values(indexInfo).some(
      index => index.some(field => field[0] === 'currentLocation' && field[1] === '2dsphere')
    );
    
    const allDrivers = await Driver.find().limit(10);
    const activeDrivers = await Driver.countDocuments({
      status: 'online'
    });
    
    const sampleDrivers = await Driver.find()
      .select('_id name currentLocation status')
      .limit(5);
    
    let nearbyDrivers = [];
    try {
      nearbyDrivers = await Driver.find({
        currentLocation: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: 10000
          }
        }
      }).limit(5);
    } catch (geoError) {
      logger.error('Geospatial query error:', geoError);
    }
    
    return res.status(200).json({
      success: true,
      diagnostics: {
        indexes: {
          all: indexInfo,
          hasCurrentLocationIndex
        },
        driverCounts: {
          total: allDrivers.length,
          active: activeDrivers
        },
        sampleDrivers: sampleDrivers.map(d => ({
          id: d._id,
          status: d.status,
          hasCurrentLocation: !!d.currentLocation,
          currentLocationValid: 
            d.currentLocation && 
            d.currentLocation.type === 'Point' && 
            Array.isArray(d.currentLocation.coordinates) && 
            d.currentLocation.coordinates.length === 2,
          currentLocationCoords: d.currentLocation?.coordinates || null
        })),
        nearbyDrivers: nearbyDrivers.map(d => ({
          id: d._id,
          name: d.name,
          distance: 'Need to calculate',
          currentLocationCoords: d.currentLocation?.coordinates
        }))
      }
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in debug endpoint',
      error: error.message
    });
  }
};