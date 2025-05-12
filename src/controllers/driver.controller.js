const mongoose = require('mongoose');
const Driver = require('../models/driver.model');
const Vehicle = require('../models/vehicle.model');
const driverService = require('../services/driver.service');
const jwt = require('jsonwebtoken');
const Ride = require('../models/ride.model');
const OTP = require('../models/otp.model');
const { notifyDriversOfNewRide } = require('../utils/socket.util');

// Complete driver registration
exports.completeRegistration = async (req, res) => {
  try {
    const driverId = req.user?._id || req.body.driverId;
    
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required. Please login before completing registration.'
      });
    }
    
    const driverData = req.body;

    console.log(`Completing registration for driver: ${driverId}`);
    
    const updatedDriver = await driverService.completeRegistration(driverId, driverData);

    updatedDriver.isRegistered = true;
    updatedDriver.registrationCompleted = true;

    await updatedDriver.save();

    const token = jwt.sign(
      {
        id: updatedDriver._id,
        role: 'driver'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Registration completed successfully',
      data: {
        token,
        driver: {
          id: updatedDriver._id,
          name: updatedDriver.name,
          phone: updatedDriver.phone,
        }
      }
    });
  } catch (error) {
    console.error('Error completing driver registration:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing registration',
      error: error.message
    });
  }
};

// Get driver profile
exports.getProfile = async (req, res) => {
  try {
    const driverId = req.user?._id || req.driver?._id || req.body.driverId;
    
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }
    
    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: driver,
    });
  } catch (error) {
    console.error('Error fetching driver profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch driver profile',
    });
  }
};

// Add a vehicle
exports.addVehicle = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { vehicleType, vehicleModel, vehicleColor, vehicleNumber } = req.body;
    
    if (!vehicleType || !vehicleModel || !vehicleColor || !vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: 'All vehicle details are required'
      });
    }
    
    const validVehicleTypes = ['Mini', 'Premium', 'Premium+', 'Rickshaw'];
    const normalizedVehicleType = validVehicleTypes.find(type => 
      type.toLowerCase() === vehicleType.toLowerCase()
    );
    
    if (!normalizedVehicleType) {
      return res.status(400).json({
        success: false,
        message: `Invalid vehicle type. Must be one of: ${validVehicleTypes.join(', ')}`,
        validTypes: validVehicleTypes
      });
    }
    
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const finalLicensePlate = `${vehicleNumber}-${randomId}`;
    
    const vehicleData = await Vehicle.create({
      driverId,
      vehicleType: normalizedVehicleType,
      vehicleModel, 
      vehicleColor,
      vehicleNumber,
      licensePlate: finalLicensePlate,
      isDefault: false,
      createdAt: new Date()
    });
    
    await Driver.findByIdAndUpdate(
      driverId,
      {
        $set: {
          'vehicleDetails.type': normalizedVehicleType,
          'vehicleDetails.model': vehicleModel,
          'vehicleDetails.color': vehicleColor,
          'vehicleDetails.licensePlate': finalLicensePlate,
          ...(!(await Vehicle.countDocuments({ driverId })) && { activeVehicleId: vehicleData._id })
        }
      },
      { new: true, runValidators: false }
    );
    
    return res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      data: vehicleData
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding vehicle',
      error: error.message
    });
  }
};

// Get all vehicles for a driver
exports.getVehicles = async (req, res) => {
  try {
    const driverId = req.driver._id;

    const vehicles = await Vehicle.find({ driverId });

    return res.status(200).json({
      status: 'success',
      results: vehicles.length,
      data: {
        vehicles,
      },
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch vehicles',
    });
  }
};

// Update a vehicle
exports.updateVehicle = async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const driverId = req.user.id;
    const { make, model, year, color, licensePlate, vehicleType } = req.body;

    const validVehicleTypes = ['Mini', 'Premium', 'Premium+', 'Rickshaw'];
    const normalizedVehicleType = validVehicleTypes.find(type => 
      type.toLowerCase() === vehicleType.toLowerCase()
    );

    if (!normalizedVehicleType) {
      return res.status(400).json({
        success: false,
        message: `Invalid vehicle type. Must be one of: ${validVehicleTypes.join(', ')}`
      });
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: vehicleId, driver: driverId },
      { make, model, year, color, licensePlate, vehicleType: normalizedVehicleType },
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
    const driverId = req.driver._id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      console.error('Invalid vehicle ID', { vehicleId });
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid vehicle ID',
      });
    }

    // Find and delete vehicle
    const vehicle = await Vehicle.findOneAndDelete({ _id: vehicleId, driverId });
    if (!vehicle) {
      console.error('Vehicle not found or driver not authorized', { vehicleId, driverId });
      return res.status(404).json({
        status: 'fail',
        message: 'Vehicle not found or you do not have permission to delete it',
      });
    }

    // Update driver if the deleted vehicle was active
    const driver = await Driver.findById(driverId);
    if (driver.activeVehicleId && driver.activeVehicleId.toString() === vehicleId) {
      // Clear activeVehicleId and vehicleDetails
      await Driver.findByIdAndUpdate(
        driverId,
        {
          $unset: {
            activeVehicleId: '',
            'vehicleDetails.type': '',
            'vehicleDetails.model': '',
            'vehicleDetails.color': '',
            'vehicleDetails.licensePlate': ''
          }
        },
        { new: true, runValidators: false }
      );
    }

    console.log('Vehicle deleted successfully', { vehicleId, driverId });

    return res.status(200).json({
      status: 'success',
      message: 'Vehicle deleted successfully',
      data: { vehicleId }
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete vehicle',
      error: error.message
    });
  }
};

// Update driver's active status
exports.updateDriverStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const driverId = req.driver._id;
    
    console.log('Updating status for driver ID:', driverId);
    
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isActive status is required'
      });
    }
    
    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { isActive: Boolean(isActive) },
      { new: true, runValidators: true }
    );
    
    if (!driver) {
      console.log('Driver not found with ID:', driverId);
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    const driverLocationModel = require('../models/driverLocation.model');
    
    await driverLocationModel.findOneAndUpdate(
      { driver: driverId },
      { isActive: Boolean(isActive) },
      { upsert: false }
    );
    
    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${isActive ? 'active' : 'inactive'}`,
      data: {
        _id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        isActive: driver.isActive,
        updatedAt: driver.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update driver status',
      error: error.message
    });
  }
};

// Get all active drivers
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

// Get nearby active drivers
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

// Select which vehicle is active for the driver
exports.selectActiveVehicle = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const vehicleId = req.params.id;
    
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      driverId: driverId
    });
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found or does not belong to you'
      });
    }
    
    await Driver.findByIdAndUpdate(
      driverId,
      { 
        activeVehicleId: vehicleId,
        vehicleType: vehicle.vehicleType
      }
    );
    
    const driverLocationModel = require('../models/driverLocation.model');
    await driverLocationModel.findOneAndUpdate(
      { driver: driverId },
      { vehicleType: vehicle.vehicleType },
      { upsert: false }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Active vehicle updated successfully',
      data: {
        vehicleId: vehicle._id,
        vehicleType: vehicle.vehicleType,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleModel: vehicle.vehicleModel
      }
    });
  } catch (error) {
    console.error('Error selecting active vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update active vehicle',
      error: error.message
    });
  }
};

// Update driver's current location
exports.updateLocation = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const { latitude, longitude } = req.body;

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      {
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Location updated successfully',
    });
  } catch (error) {
    console.error('Error in updateLocation:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating location',
      error: error.message,
    });
  }
};

// Update driver status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const driverId = req.user._id;
    
    if (!['online', 'offline', 'busy'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be online, offline, or busy' 
      });
    }
    
    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { status },
      { new: true, runValidators: true }
    );
    
    if (!updatedDriver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    
    return res.status(200).json({
      success: true,
      message: `Status updated to ${status}`,
      data: { status: updatedDriver.status }
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    return res.status(500).json({ success: false, message: 'Error updating status' });
  }
};

// Toggle driver online/offline status
exports.toggleOnlineStatus = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    const newStatus = driver.status === 'online' ? 'offline' : 'online';
    driver.status = newStatus;
    await driver.save();

    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${newStatus}`,
      data: { status: newStatus },
    });
  } catch (error) {
    console.error('Error in toggleOnlineStatus:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating driver status',
      error: error.message,
    });
  }
};

// Get available rides
exports.getAvailableRides = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    if (driver.status !== 'online') {
      return res.status(400).json({
        success: false,
        message: 'Driver must be online to view available rides',
      });
    }

    const rides = await Ride.find({
      status: 'pending',
      isExpired: false,
      expiresAt: { $gt: new Date() },
      vehicleType: driver.vehicleDetails?.type || driver.carType || 'Standard',
      pickupLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: driver.currentLocation.coordinates,
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
    console.error('Error in getAvailableRides:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving available rides',
      error: error.message,
    });
  }
};

// Debug rides
exports.debugRides = async (req, res) => {
  try {
    const driverId = req.body.driverId;
    const driver = await Driver.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    const allPendingRides = await Ride.find({ status: 'pending' })
      .select('vehicleType pickupLocation dropoffLocation status createdAt')
      .limit(10);
    
    const driverLocation = driver.currentLocation?.coordinates || 
                          driver.location?.coordinates || 
                          [0, 0];
    
    const rawVehicleType = driver.vehicleDetails?.type || 
                         driver.vehicleType || 
                         driver.carType || 
                         'Unknown';
    
    return res.status(200).json({
      success: true,
      diagnostics: {
        driverInfo: {
          id: driver._id,
          status: driver.status,
          location: driverLocation,
          rawVehicleType: rawVehicleType,
          vehicleDetails: driver.vehicleDetails,
          carType: driver.carType
        },
        pendingRides: allPendingRides.map(ride => ({
          id: ride._id,
          vehicleType: ride.vehicleType,
          pickupLocation: ride.pickupLocation,
          dropoffLocation: ride.dropoffLocation,
          status: ride.status,
          createdAt: ride.createdAt
        })),
        driverSchema: Object.keys(driver._doc),
        rideSchema: allPendingRides.length > 0 ? Object.keys(allPendingRides[0]._doc) : []
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in debug function',
      error: error.message
    });
  }
};

// Refresh available rides
exports.refreshAvailableRides = async (req, res) => {
  try {
    const driverId = req.user?._id || req.body.driverId;
    
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }
    
    const driver = await Driver.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    let driverVehicleType = driver.vehicleType;

    if (driver.activeVehicleId) {
      const activeVehicle = await Vehicle.findById(driver.activeVehicleId);
      if (activeVehicle) {
        driverVehicleType = activeVehicle.vehicleType;
      }
    }

    const validVehicleTypes = ['Mini', 'Premium', 'Premium+', 'Rickshaw'];
    const normalizedVehicleType = validVehicleTypes.find(type => 
      type.toLowerCase() === driverVehicleType?.toLowerCase()
    );

    driverVehicleType = normalizedVehicleType || 'Mini';

    console.log(`Driver ${driver._id} has vehicle type: ${driverVehicleType}`);

    const matchingRides = await Ride.find({
      status: 'pending',
      vehicleType: driverVehicleType,
      isExpired: { $ne: true },
      expiresAt: { $gt: new Date() }
    })
    .populate('userId', 'name rating profilePhoto phone')
    .sort({ createdAt: -1 })
    .limit(10);

    console.log(`Found ${matchingRides.length} rides matching driver's vehicle type ${driverVehicleType}`);
    
    const formattedRides = matchingRides.map(ride => ({
      id: ride._id,
      pickup: ride.pickupLocation?.address || 'Unknown location',
      pickupCoords: {
        latitude: ride.pickupLocation?.lat || ride.pickupLocation?.coordinates?.[1] || 0,
        longitude: ride.pickupLocation?.lng || ride.pickupLocation?.coordinates?.[0] || 0
      },
      destination: ride.dropoffLocation?.address || 'Unknown destination',
      distance: ride.distance || 0,
      fare: ride.estimatedFare || ride.userProposedFare || 0,
      user: {
        name: ride.userId?.name || 'Anonymous',
        rating: ride.userId?.rating || 'N/A',
        photo: ride.userId?.profilePhoto || null,
        phone: ride.userId?.phone || null
      },
      createdAt: ride.createdAt,
      vehicleType: ride.vehicleType,
      userProposedFare: ride.userProposedFare || null
    }));
    
    return res.status(200).json({
      success: true,
      message: `Found ${matchingRides.length} available rides`,
      data: {
        driverId: driver._id,
        name: driver.name,
        status: driver.status,
        availableRides: formattedRides
      }
    });
  } catch (error) {
    console.error('Error refreshing available rides:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching available rides',
      error: error.message
    });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required'
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('DEV MODE: Bypassing OTP verification');
      
      let driver = await Driver.findOne({ phone });
      
      if (!driver) {
        driver = new Driver({
          phone,
          isPhoneVerified: true
        });
        
        await driver.save({ validateBeforeSave: false });
        
        console.log(`Created new minimal driver record for ${phone}`);
      } else {
        driver.isPhoneVerified = true;
        await driver.save({ validateBeforeSave: false });
      }
      
      const token = jwt.sign(
        { id: driver._id, type: 'driver' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '30d' }
      );
      
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          token,
          driver: {
            id: driver._id,
            name: driver.name || '',
            phone: driver.phone,
            isRegistered: driver.isRegistered || false,
            isPhoneVerified: true
          }
        }
      });
    }
    
    const otpRecord = await OTP.findOne({
      phone,
      otp,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    
    otpRecord.isUsed = true;
    await otpRecord.save();
    
    let driver = await Driver.findOne({ phone });
    
    if (!driver) {
      driver = new Driver({
        phone,
        isPhoneVerified: true
      });
      
      await driver.save({ validateBeforeSave: false });
    } else {
      driver.isPhoneVerified = true;
      await driver.save({ validateBeforeSave: false });
    }
    
    const token = jwt.sign(
      { id: driver._id, type: 'driver' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        token,
        driver: {
          id: driver._id,
          name: driver.name || '',
          phone: driver.phone,
          isRegistered: driver.isRegistered || false,
          isPhoneVerified: true
        }
      }
    });
  } catch (error) {
    console.error('Error verifying driver OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying OTP',
      error: error.message
    });
  }
};

// Debug vehicle matching
exports.debugVehicleMatching = async (req, res) => {
  try {
    const driverId = req.user._id;
    
    const driver = await Driver.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    let driverVehicleType = driver.vehicleDetails?.type;
    let activeVehicleDetails = null;
    
    if (driver.activeVehicleId) {
      const activeVehicle = await Vehicle.findById(driver.activeVehicleId);
      if (activeVehicle) {
        driverVehicleType = activeVehicle.vehicleType;
        activeVehicleDetails = {
          id: activeVehicle._id,
          type: activeVehicle.vehicleType,
          model: activeVehicle.vehicleModel,
          number: activeVehicle.vehicleNumber
        };
      }
    }
    
    const allVehicles = await Vehicle.find({ driverId });
    
    const allPendingRides = await Ride.find({ 
      status: 'pending',
      isExpired: { $ne: true },
      expiresAt: { $gt: new Date() }
    })
    .select('_id vehicleType status createdAt')
    .limit(20);
    
    const matchingRides = allPendingRides.filter(ride => 
      ride.vehicleType?.toLowerCase() === driverVehicleType?.toLowerCase()
    );
    
    return res.status(200).json({
      success: true,
      data: {
        driver: {
          id: driver._id,
          name: driver.name,
          status: driver.status,
          vehicleType: driverVehicleType
        },
        activeVehicle: activeVehicleDetails,
        allVehicles: allVehicles.map(v => ({
          id: v._id,
          type: v.vehicleType,
          model: v.vehicleModel,
          number: v.vehicleNumber,
          isActive: v._id.toString() === (driver.activeVehicleId?.toString() || '')
        })),
        rides: {
          all: allPendingRides.length,
          matching: matchingRides.length,
          matchingRides: matchingRides.map(r => ({
            id: r._id,
            vehicleType: r.vehicleType,
            createdAt: r.createdAt
          }))
        }
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in debug function',
      error: error.message
    });
  }
};

// Get active ride
exports.getActiveRide = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const ride = await Ride.findOne({
      driverId,
      status: { $in: ['accepted', 'arrived', 'started'] },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'No active ride found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Active ride retrieved successfully',
      data: {
        id: ride._id,
        status: ride.status,
        pickup: ride.pickupLocation?.address || 'Unknown',
        destination: ride.dropoffLocation?.address || 'Unknown',
        fare: ride.estimatedFare || 0,
        distance: ride.distance || 0,
        user: {
          id: ride.userId ? ride.userId.toString() : 'unknown',
          name: ride.userName || 'User',
          phone: ride.userPhone || 'Unknown',
        },
      },
    });
  } catch (error) {
    console.error('Error in getActiveRide:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving active ride',
      error: error.message,
    });
  }
};

// Get ride history
exports.getRideHistory = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const rides = await Ride.find({ driverId }).sort({ createdAt: -1 }).limit(50);

    const formattedRides = rides.map((ride) => ({
      id: ride._id,
      status: ride.status,
      pickup: ride.pickupLocation?.address || 'Unknown',
      destination: ride.dropoffLocation?.address || 'Unknown',
      fare: ride.finalFare || ride.estimatedFare || 0,
      distance: ride.distance || 0,
      createdAt: ride.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: 'Ride history retrieved successfully',
      data: formattedRides,
    });
  } catch (error) {
    console.error('Error in getRideHistory:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving ride history',
      error: error.message,
    });
  }
};

// Get earnings
exports.getEarnings = async (req, res) => {
  try {
    const driverId = req.driver._id;
    const rides = await Ride.find({
      driverId,
      status: 'completed',
    });

    const totalEarnings = rides.reduce((sum, ride) => sum + (ride.finalFare || 0), 0);
    const totalRides = rides.length;

    return res.status(200).json({
      success: true,
      message: 'Earnings retrieved successfully',
      data: {
        totalEarnings,
        totalRides,
      },
    });
  } catch (error) {
    console.error('Error in getEarnings:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving earnings',
      error: error.message,
    });
  }
};

module.exports = exports;