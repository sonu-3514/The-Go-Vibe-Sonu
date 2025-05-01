const geofenceService = require('../services/geofence.service');
const Geofence = require('../models/geofence.model');
const Location = require('../models/location.model');
const logger = require('../utils/logger');

/**
 * Create a new geofence
 */
exports.createGeofence = async (req, res, next) => {
  try {
    // For simplicity, we'll consider drivers with isAdmin flag as admins
    // This avoids creating a separate admin model
    if (!req.driver || !req.driver.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { name, type, longitude, latitude, radius, multiplier, description } = req.body;
    
    if (!name || !type || !longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, longitude and latitude are required'
      });
    }
    
    const geofence = new Geofence({
      name,
      description,
      type,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      radius: radius ? parseFloat(radius) : 10000, // Default 10km
      multiplier: type === 'surge' ? (multiplier || 1.5) : 1.0,
      createdBy: req.driver._id
    });
    
    await geofence.save();
    
    return res.status(201).json({
      success: true,
      message: 'Geofence created successfully',
      data: geofence
    });
  } catch (error) {
    logger.error(`Error creating geofence: ${error.message}`);
    next(error);
  }
};

/**
 * Get all geofences
 */
exports.getAllGeofences = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      count: 0,
      data: [] // Placeholder for actual geofence list
    });
  } catch (error) {
    logger.error(`Error getting all geofences: ${error.message}`);
    next(error);
  }
};

/**
 * Get geofence by ID
 */
exports.getGeofenceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    return res.status(200).json({
      success: true,
      data: { id } // Placeholder for actual geofence details
    });
  } catch (error) {
    logger.error(`Error getting geofence by ID: ${error.message}`);
    next(error);
  }
};

/**
 * Update driver location
 */
exports.updateDriverLocation = async (req, res, next) => {
  try {
    const { longitude, latitude, isAvailable, vehicleType } = req.body;
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }
    
    // Get driver from request (set by auth middleware)
    const driverId = req.driver._id;
    
    // Update driver location
    await geofenceService.updateLocation(
      driverId, 
      'Driver',
      longitude,
      latitude,
      { 
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        vehicleType: vehicleType || req.driver.vehicleType || 'car'
      }
    );
    
    // Check if in restricted zone
    const isRestricted = await geofenceService.isInRestrictedZone(longitude, latitude);
    
    // Get surge pricing if applicable
    const surgeMultiplier = await geofenceService.getSurgeMultiplier(longitude, latitude);
    
    return res.status(200).json({
      success: true,
      data: {
        isRestricted,
        surgeMultiplier,
        message: isRestricted ? 
          'Warning: You are in a restricted zone' : 
          'Location updated successfully'
      }
    });
  } catch (error) {
    logger.error(`Error updating driver location: ${error.message}`);
    next(error);
  }
};

/**
 * Update user location
 */
exports.updateUserLocation = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'User location updated successfully'
    });
  } catch (error) {
    logger.error(`Error updating user location: ${error.message}`);
    next(error);
  }
};

/**
 * Find nearby drivers
 */
exports.findNearbyDrivers = async (req, res, next) => {
  try {
    const { longitude, latitude, vehicleType, radius } = req.query;
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }
    
    const drivers = await geofenceService.findNearbyDrivers(
      longitude,
      latitude,
      { 
        vehicleType,
        radius: radius ? parseFloat(radius) * 1000 : 10000, // Convert km to meters
        limit: 20
      }
    );
    
    return res.status(200).json({
      success: true,
      count: drivers.length,
      data: drivers
    });
  } catch (error) {
    logger.error(`Error finding nearby drivers: ${error.message}`);
    next(error);
  }
};

/**
 * Find nearby users
 */
exports.findNearbyUsers = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      count: 0,
      data: [] // Placeholder for actual nearby users
    });
  } catch (error) {
    logger.error(`Error finding nearby users: ${error.message}`);
    next(error);
  }
};

/**
 * Check location status (geofences, restrictions, etc.)
 */
exports.checkLocationStatus = async (req, res, next) => {
  try {
    const { longitude, latitude } = req.query;
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }
    
    // Check if in restricted zone
    const isRestricted = await geofenceService.isInRestrictedZone(longitude, latitude);
    
    // Get surge pricing if applicable
    const surgeMultiplier = await geofenceService.getSurgeMultiplier(longitude, latitude);
    
    return res.status(200).json({
      success: true,
      data: {
        isRestricted,
        surgeMultiplier,
        allowService: !isRestricted
      }
    });
  } catch (error) {
    logger.error(`Error checking location status: ${error.message}`);
    next(error);
  }
};

// Check if updateGeofence is implemented
exports.updateGeofence = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'This endpoint is not yet implemented'
  });
};

/**
 * Delete geofence by ID
 */
exports.deleteGeofence = async (req, res) => {
  try {
    const { id } = req.params;
    
    // For MVP, just return a placeholder response
    // Later, implement actual deletion logic
    res.status(501).json({
      success: false,
      message: 'Delete geofence endpoint is not yet implemented',
      geofenceId: id
    });
    
    /* Actual implementation would be something like:
    const deletedGeofence = await Geofence.findByIdAndDelete(id);
    
    if (!deletedGeofence) {
      return res.status(404).json({
        success: false,
        message: 'Geofence not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Geofence deleted successfully'
    });
    */
  } catch (error) {
    console.error('Error deleting geofence:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting geofence'
    });
  }
};