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
exports.updateLocation = async (entityId, entityType, longitude, latitude, additionalData = {}) => {
  const DriverLocation = require('../models/driverLocation.model');
  const coordinates = [parseFloat(longitude), parseFloat(latitude)];
  if (entityType === 'Driver') {
      const update = {
          location: {
              type: 'Point',
              coordinates
          },
          isAvailable: additionalData.isAvailable ?? true,
          isActive: additionalData.isActive ?? true,
          vehicleType: additionalData.vehicleType || 'Mini'
      };
      const result = await DriverLocation.findOneAndUpdate(
          { driver: entityId },
          update,
          { upsert: true, new: true }
      );
  }
  return true;
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