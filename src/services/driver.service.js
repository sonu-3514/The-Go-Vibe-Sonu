const Driver = require('../models/driver.model');
const DriverVerification = require('../models/DriverVerification');
const DriverLocation = require('../models/driverLocation.model');

exports.completeRegistration = async (driverId, driverData) => {
  const { 
    name, 
    email, 
    vehicleType, 
    vehicleModel, 
    vehicleColor, 
    vehicleNumber,
    licenseNumber,
    dob,
    gender,
    aadharCard,
    panCard,
    drivingLicense
  } = driverData;

  // Update the driver with registration data
  const driver = await Driver.findByIdAndUpdate(
    driverId,
    {
      name,
      email,
      licenseNumber,
      dob,
      gender,
      aadharCard,
      panCard,
      drivingLicense,
      isRegistered: true,
      registrationCompleted: true,
      vehicle: {
        type: vehicleType,
        model: vehicleModel,
        color: vehicleColor,
        registrationNumber: vehicleNumber
      }
    },
    { new: true, runValidators: true }
  );

  if (!driver) {
    throw new Error('Driver not found');
  }

  return driver;
};

exports.getDriverProfile = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new Error('Driver not found');
  }
  return driver;
};

/**
 * Update driver's active status
 * @param {string} driverId - The driver's ID
 * @param {boolean} isActive - The new active status
 * @returns {Promise<Object>} - Updated driver object
 */
exports.updateDriverStatus = async (driverId, isActive) => {
  const driver = await Driver.findByIdAndUpdate(
    driverId,
    { isActive },
    { new: true }
  );

  if (!driver) {
    throw new Error('Driver not found');
  }

  // If driver is going inactive, update their location status too
  if (!isActive) {
    await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      { isAvailable: false },
      { new: true }
    );
  }

  return driver;
};

/**
 * Get all active drivers
 * @returns {Promise<Array>} - Array of active drivers
 */
exports.getActiveDrivers = async () => {
  return await Driver.find({ isActive: true });
};

/**
 * Get nearby active drivers
 * @param {Array} coordinates - [longitude, latitude] coordinates
 * @param {Number} maxDistance - Maximum distance in meters
 * @param {String} vehicleType - Type of vehicle to filter by (optional)
 * @returns {Promise<Array>} - Array of nearby active drivers
 */
exports.getNearbyActiveDrivers = async (coordinates, maxDistance = 5000, vehicleType = null) => {
  const query = {
    isAvailable: true,
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  };

  // Add vehicle type filter if provided
  if (vehicleType) {
    query.vehicleType = vehicleType;
  }

  // Find available drivers and populate driver details
  const activeDriverLocations = await DriverLocation.find(query)
    .populate({
      path: 'driver',
      select: 'name phone ratings vehicleDetails isActive',
      match: { isActive: true } // Only include active drivers
    });

  // Filter out locations where driver is null (happens if driver isn't active)
  return activeDriverLocations.filter(location => location.driver !== null);
};

