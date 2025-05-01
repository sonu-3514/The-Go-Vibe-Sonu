// driverOtp.service.js
const Driver = require('../models/driver.model');
const DriverOTP = require('../models/driverOtp.model');
const { sendOTP: sendOTPSms } = require('../utils/sms');
const { isDevMode } = require('../utils/helpers');

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP to the driver's phone
 */
exports.sendOTP = async (phone) => {
  try {
    // Find driver by either phone or mobileNumber
    let driver = await Driver.findOne({ 
      $or: [
        { phone: phone },
        { mobileNumber: phone }
      ]
    });
    
    if (!driver) {
      // Create a new driver if one doesn't exist with this phone
      driver = new Driver({
        mobileNumber: phone,
        phone: phone
      });
      await driver.save();
    } else {
      // Update the phone field if it's missing
      if (!driver.phone) {
        driver.phone = phone;
        await driver.save();
      }
    }

    // Generate new OTP
    const otp = generateOTP();
    
    // Save OTP to database
    await DriverOTP.findOneAndUpdate(
      { phone },
      { phone, otp },
      { upsert: true, new: true }
    );

    // Always attempt to send SMS
    try {
      await sendOTPSms(phone, otp);
      console.log(`SMS sent to ${phone} with OTP: ${otp}`);
    } catch (smsError) {
      console.error(`Failed to send SMS: ${smsError.message}`);
    }

    // In development/test environment, return OTP in response
    if (isDevMode()) {
      return {
        success: true,
        message: 'OTP sent successfully',
        phone,
        otp, // Return OTP for testing purposes
      };
    }
    
    return {
      success: true,
      message: 'OTP sent successfully'
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      message: `Failed to send OTP: ${error.message}`
    };
  }
};

/**
 * Verify OTP
 */
exports.verifyOTP = async (phone, otpToVerify) => {
  try {
    // Find the latest OTP for this phone number
    const otpRecord = await DriverOTP.findOne({ phone }).sort({ createdAt: -1 });
    
    if (!otpRecord) {
      return {
        success: false,
        message: 'No OTP found for this phone number'
      };
    }
    
    // Check if OTP matches
    if (otpRecord.otp !== otpToVerify) {
      return {
        success: false,
        message: 'Invalid OTP'
      };
    }

    // Find the associated driver
    const driver = await Driver.findOne({ phone });
    if (!driver) {
      return {
        success: false,
        message: 'Driver not found'
      };
    }

    // Delete used OTP
    await DriverOTP.findByIdAndDelete(otpRecord._id);
    
    return {
      success: true,
      message: 'OTP verified successfully',
      driver
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      message: `Failed to verify OTP: ${error.message}`
    };
  }
};
