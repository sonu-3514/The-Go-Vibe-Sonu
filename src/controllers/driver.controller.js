const Driver = require('../models/driver.model');
const Vehicle = require('../models/vehicle.model');
const driverService = require('../services/driver.service');

// Complete driver registration
exports.completeRegistration = async (req, res) => {
  try {
    const driverId = req.user.id;
    const driverData = req.body;

    // Call the service to complete registration
    const updatedDriver = await driverService.completeRegistration(driverId, driverData);

    res.status(200).json({
      status: 'success',
      isRegistered: true, // Set to true after registration
      data: {
        driver: updatedDriver
      }
    });
  } catch (error) {
    console.error('Error completing registration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete registration'
    });
  }
};

// Get driver profile
exports.getProfile = async (req, res) => {
  try {
    const driverId = req.user.id;
    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        status: 'fail',
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        driver
      }
    });
  } catch (error) {
    console.error('Error fetching driver profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch driver profile'
    });
  }
};

// Add a vehicle
exports.addVehicle = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { make, model, year, color, licensePlate, vehicleType } = req.body;

    const vehicle = await Vehicle.create({
      driver: driverId,
      make,
      model,
      year,
      color,
      licensePlate,
      vehicleType
    });

    res.status(201).json({
      status: 'success',
      data: {
        vehicle
      }
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add vehicle'
    });
  }
};

// Get all vehicles for a driver
exports.getVehicles = async (req, res) => {
  try {
    const driverId = req.user.id;
    const vehicles = await Vehicle.find({ driver: driverId });

    res.status(200).json({
      status: 'success',
      results: vehicles.length,
      data: {
        vehicles
      }
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch vehicles'
    });
  }
};

// Update a vehicle
exports.updateVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const driverId = req.user.id;
    const { make, model, year, color, licensePlate, vehicleType } = req.body;

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: vehicleId, driver: driverId },
      { make, model, year, color, licensePlate, vehicleType },
      { new: true, runValidators: true }
    );

    if (!vehicle) {
      return res.status(404).json({
        status: 'fail',
        message: 'Vehicle not found or you do not have permission to update it'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        vehicle
      }
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update vehicle'
    });
  }
};

// Delete a vehicle
exports.deleteVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const driverId = req.user.id;

    const vehicle = await Vehicle.findOneAndDelete({ _id: vehicleId, driver: driverId });

    if (!vehicle) {
      return res.status(404).json({
        status: 'fail',
        message: 'Vehicle not found or you do not have permission to delete it'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete vehicle'
    });
  }
};

/**
 * Update driver's active status
 * @route PUT /api/drivers/:id/status
 */
exports.updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'isActive field must be a boolean value' 
      });
    }
    
    const driver = await driverService.updateDriverStatus(id, isActive);
    
    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${isActive ? 'active' : 'inactive'}`,
      data: driver
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get all active drivers
 * @route GET /api/drivers/active
 */
exports.getActiveDrivers = async (req, res) => {
  try {
    const activeDrivers = await driverService.getActiveDrivers();
    
    return res.status(200).json({
      success: true,
      count: activeDrivers.length,
      data: activeDrivers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get nearby active drivers
 * @route GET /api/drivers/nearby
 */
exports.getNearbyActiveDrivers = async (req, res) => {
  try {
    const { longitude, latitude, maxDistance, vehicleType } = req.query;
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }
    
    const coordinates = [parseFloat(longitude), parseFloat(latitude)];
    const distance = maxDistance ? parseInt(maxDistance) : 5000;
    
    const nearbyDrivers = await driverService.getNearbyActiveDrivers(
      coordinates,
      distance,
      vehicleType
    );
    
    return res.status(200).json({
      success: true,
      count: nearbyDrivers.length,
      data: nearbyDrivers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
