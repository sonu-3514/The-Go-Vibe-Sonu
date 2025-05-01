const otpService = require('../services/otp.service');
const authService = require('../services/auth.service');
const { generateToken } = require('../services/auth.service');

exports.sendOTP = async (req, res, next) => {
  try {
    const { mobileNumber } = req.body;
    
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const result = await otpService.sendOTP(mobileNumber);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { mobileNumber, otp } = req.body;
    
    if (!mobileNumber || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mobile number and OTP are required' 
      });
    }

    // Verify OTP
    await otpService.verifyOTP(mobileNumber, otp);

    // Check if user exists
    let user = await authService.getUserByMobileNumber(mobileNumber);
    
    if (!user) {
      // Create new user if doesn't exist
      user = await authService.createUser(mobileNumber);
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      isRegistered: user.isRegistered,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    next(error);
  }
};