const otpService = require('../services/otp.service');
const User = require('../models/user.model');
const Driver = require('../models/driver.model');
const OTP = require('../models/otp.model'); // Add this line
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger'); // Add this if you're using logger

exports.sendOTP = async (req, res, next) => {
  try {
      const { phone } = req.body;
      
      if (!phone) {
          return res.status(400).json({ 
              success: false, 
              message: 'Phone number is required' 
          });
      }

      const result = await otpService.sendOTP(phone);
      return res.status(200).json(result);
  } catch (error) {
      console.error('Error in sendOTP controller:', error);
      return res.status(500).json({ 
          success: false, 
          message: error.message || 'Failed to send OTP'
      });
  }
};

/**
 * Verify OTP and generate token
 */
exports.verifyOTP = async (req, res, next) => {
  try {
      const { phone, otp, userType = 'user' } = req.body;
      
      if (!phone || !otp) {
          return res.status(400).json({
              success: false,
              message: 'Phone number and OTP are required'
          });
      }
      
      // DEVELOPMENT MODE BYPASS - Remove in production
      if (process.env.NODE_ENV === 'development' && otp === '334841') {
          console.log('DEV MODE: Bypassing OTP verification');
      } else {
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
      }
      
      if (userType === 'driver') {
          let driver = await Driver.findOne({ phone });
          
          if (!driver) {
              driver = await Driver.create({
                  phone,
                  isPhoneVerified: true,
                  isRegistered: false
              });
          } else {
              driver.isPhoneVerified = true;
              await driver.save();
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
                      name: driver.name,
                      phone: driver.phone,
                      isRegistered: driver.isRegistered,
                      isPhoneVerified: driver.isPhoneVerified
                  }
              }
          });
      } else {
          let user = await User.findOne({ phone });
          
          if (!user) {
              user = await User.create({
                  phone,
                  isPhoneVerified: true,
                  isRegistered: false
              });
          } else {
              user.isPhoneVerified = true;
              await user.save();
          }
          
          const token = jwt.sign(
              { id: user._id, type: 'user' },
              process.env.JWT_SECRET,
              { expiresIn: '30d' }
          );
          
          return res.status(200).json({
              success: true,
              message: 'OTP verified successfully',
              data: {
                  token,
                  user: {
                      id: user._id,
                      name: user.name,
                      phone: user.phone,
                      isRegistered: user.isRegistered,
                      isPhoneVerified: user.isPhoneVerified
                  }
              }
          });
      }
  }
  catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({
        success: false,
        message: 'Error verifying OTP',
        error: error.message
    });
}
};
/**
 * Complete user registration
 */
exports.completeRegistration = async (req, res, next) => {
  try {
    const { name, email, gender, dob, profilePhoto } = req.body;
    const user = req.user;
    
    console.log(`Completing registration for user ID: ${user._id}`);
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required to complete registration' 
      });
    }

    // Create update operations
    const updateSet = {
      name,
      isRegistered: true
    };
    
    if (gender) updateSet.gender = gender;
    if (dob) updateSet.dob = new Date(dob);
    if (profilePhoto) updateSet.profilePhoto = profilePhoto;
    
    // Operations to perform
    const updateOperations = { $set: updateSet };
    
    // Handle email separately
    if (email && email.trim() !== '') {
      // If valid email provided, set it
      updateSet.email = email;
    } else {
      // If no email or empty email, explicitly unset the field
      updateOperations.$unset = { email: "" };
    }
    
    // Use updateOne with the operations
    await User.updateOne(
      { _id: user._id },
      updateOperations
    );
    
    // Fetch the updated user
    const updatedUser = await User.findById(user._id);
    
    console.log(`User registration completed for ID: ${user._id}`);
    
    return res.status(200).json({
      success: true,
      message: 'Registration completed successfully',
      user: {
        id: updatedUser._id,
        mobileNumber: updatedUser.mobileNumber,
        name: updatedUser.name,
        email: updatedUser.email,
        gender: updatedUser.gender,
        dob: updatedUser.dob,
        profilePhoto: updatedUser.profilePhoto,
        isRegistered: updatedUser.isRegistered
      }
    });
  } catch (error) {
    console.error('Error in completeRegistration controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete registration'
    });
  }
};
exports.getNearbyDrivers = async (req, res) => {
  try {
      const { latitude, longitude, vehicleType } = req.query;
      
      if (!latitude || !longitude) {
          return res.status(400).json({
              success: false,
              message: 'Latitude and longitude are required'
          });
      }
      
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
          return res.status(400).json({
              success: false,
              message: 'Invalid coordinates format'
          });
      }
      
      const query = {
          status: 'online',
          isActive: true,
          location: {
              $near: {
                  $geometry: {
                      type: 'Point',
                      coordinates: [lng, lat]
                  },
                  $maxDistance: 5000
              }
          }
      };
      
      if (vehicleType) {
          query['vehicleDetails.type'] = vehicleType;
      }
      
      const drivers = await Driver.find(query)
          .select('name rating profilePhoto vehicleDetails location')
          .limit(10);
      
      const formattedDrivers = drivers.map(driver => {
          const driverCoords = driver.location.coordinates;
          const distanceToUser = calculateDistance(lat, lng, driverCoords[1], driverCoords[0]);
          
          return {
              id: driver._id,
              name: driver.name,
              rating: driver.rating || 5,
              photo: driver.profilePhoto,
              vehicleDetails: driver.vehicleDetails,
              distance: parseFloat(distanceToUser.toFixed(2)),
              estimatedTime: Math.round(distanceToUser * 3)
          };
      });
      
      formattedDrivers.sort((a, b) => a.distance - b.distance);
      
      return res.status(200).json({
          success: true,
          count: formattedDrivers.length,
          data: formattedDrivers
      });
  } catch (error) {
      console.error('Error finding nearby drivers:', error);
      return res.status(500).json({
          success: false,
          message: 'Error finding nearby drivers',
          error: error.message
      });
  }
};