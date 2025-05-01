const Geofence = require('../models/geofence.model');
const Location = require('../models/location.model');
const User = require('../models/user.model');
const Driver = require('../models/driver.model'); // Assuming this is your driver model path
const logger = require('../utils/logger');

/**
 * Create a new geofence
 */
exports.createGeofence = async (geofenceData) => {
    try {
        const geofence = new Geofence(geofenceData);
        await geofence.save();
        logger.info(`Created new geofence: ${geofence.name}`);
        return geofence;
    } catch (error) {
        logger.error(`Error creating geofence: ${error}`);
        throw error;
    }
};

/**
 * Get all geofences
 */
exports.getAllGeofences = async (filters = {}) => {
    try {
        return await Geofence.find({ active: true, ...filters });
    } catch (error) {
        logger.error(`Error getting geofences: ${error}`);
        throw error;
    }
};

/**
 * Get geofence by ID
 */
exports.getGeofenceById = async (id) => {
    try {
        return await Geofence.findById(id);
    } catch (error) {
        logger.error(`Error getting geofence by ID: ${error}`);
        throw error;
    }
};

/**
 * Check if a point is within any geofences of specified type
 */
exports.checkPointInGeofence = async (longitude, latitude, type = null) => {
  try {
    const query = {
      active: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          }
        }
      }
    };
    
    // Add type filter if provided
    if (type) {
      query.type = type;
    }
    
    // Find geofences that contain this point
    const geofences = await Geofence.find(query);
    
    // Filter geofences by checking if point is within radius
    return geofences.filter(fence => {
      const distance = calculateDistance(
        latitude, longitude,
        fence.location.coordinates[1],
        fence.location.coordinates[0]
      ) * 1000; // Convert km to meters
      
      return distance <= fence.radius;
    });
  } catch (error) {
    logger.error(`Error checking point in geofence: ${error.message}`);
    return []; // Return empty array on error
  }
};

/**
 * Update location for a user (driver or rider)
 */
exports.updateLocation = async (userId, userType, longitude, latitude, options = {}) => {
  try {
    const locationData = {
      user: userId,
      userType,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      lastUpdated: new Date()
    };

    // Add additional fields if provided
    if (options.isAvailable !== undefined) locationData.isAvailable = options.isAvailable;
    if (options.vehicleType) locationData.vehicleType = options.vehicleType;
    
    // Update or create location record
    const location = await Location.findOneAndUpdate(
      { user: userId, userType },
      locationData,
      { new: true, upsert: true }
    );
    
    return location;
  } catch (error) {
    logger.error(`Error updating location: ${error.message}`);
    throw error;
  }
};

/**
 * Find nearby drivers within specified radius
 */
exports.findNearbyDrivers = async (longitude, latitude, options = {}) => {
  try {
    const radius = options.radius || 10000; // Default 10km
    
    const query = {
      userType: 'Driver',
      isAvailable: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: radius
        }
      }
    };
    
    // Add vehicle type filter if provided
    if (options.vehicleType) {
      query.vehicleType = options.vehicleType;
    }
    
    // Find nearby drivers
    const drivers = await Location.find(query)
      .populate('user', 'name mobileNumber')
      .limit(options.limit || 20);
      
    // Placeholder logic until we have real data
    return drivers.length > 0 ? drivers.map(driver => ({
      driverId: driver.user._id,
      name: driver.user.name || 'Driver',
      mobileNumber: driver.user.mobileNumber,
      vehicleType: driver.vehicleType || 'car',
      location: {
        longitude: driver.location.coordinates[0],
        latitude: driver.location.coordinates[1]
      },
      distance: calculateDistance(
        latitude, longitude,
        driver.location.coordinates[1],
        driver.location.coordinates[0]
      )
    })) : [];
  } catch (error) {
    logger.error(`Error finding nearby drivers: ${error.message}`);
    return []; // Return empty array on error
  }
};

/**
 * Find nearby users within radius (default 10km)
 */
exports.findNearbyUsers = async (longitude, latitude, radiusInKm = 10) => {
    try {
        // Convert km to meters
        const radiusInMeters = radiusInKm * 1000;
        
        // Find nearby users
        const users = await UserLocation.find({
            location: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: radiusInMeters
                }
            }
        }).populate('user', 'name profileImage').limit(50);
        
        return users.map(user => ({
            userId: user.user._id,
            name: user.user.name,
            profileImage: user.user.profileImage,
            location: {
                latitude: user.location.coordinates[1],
                longitude: user.location.coordinates[0]
            },
            distance: calculateDistance(
                latitude, longitude,
                user.location.coordinates[1],
                user.location.coordinates[0]
            )
        }));
    } catch (error) {
        logger.error(`Error finding nearby users: ${error}`);
        throw error;
    }
};

/**
 * Get surge multiplier for a location
 */
exports.getSurgeMultiplier = async (longitude, latitude) => {
  try {
    const surgeGeofences = await exports.checkPointInGeofence(longitude, latitude, 'surge');
    
    if (surgeGeofences.length === 0) {
      return 1.0; // Default: no surge
    }
    
    // Return highest surge multiplier if multiple apply
    return Math.max(...surgeGeofences.map(fence => fence.multiplier));
  } catch (error) {
    logger.error(`Error getting surge multiplier: ${error.message}`);
    return 1.0; // Default in case of error
  }
};

/**
 * Check if location is in a restricted zone
 */
exports.isInRestrictedZone = async (longitude, latitude) => {
  try {
    const restrictedZones = await exports.checkPointInGeofence(longitude, latitude, 'restricted');
    return restrictedZones.length > 0;
  } catch (error) {
    logger.error(`Error checking restricted zone: ${error.message}`);
    return false; // Default to not restricted in case of error
  }
};

/**
 * Calculate if a point is within a circle
 */
function isPointInCircle(pointLat, pointLng, centerLat, centerLng, radiusMeters) {
    const R = 6371e3; // Earth's radius in meters
    
    // Convert to radians
    const φ1 = (pointLat * Math.PI) / 180;
    const φ2 = (centerLat * Math.PI) / 180;
    const Δφ = ((centerLat - pointLat) * Math.PI) / 180;
    const Δλ = ((centerLng - pointLng) * Math.PI) / 180;
    
    // Haversine formula
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    const distance = R * c;
    
    return distance <= radiusMeters;
}

/**
 * Calculate distance between two points in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}