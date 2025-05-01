const mongoose = require('mongoose');

const driverOtpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: process.env.OTP_EXPIRY_MINUTES * 60 || 600 // Default 10 minutes
  }
});

// Create index on phone field for faster lookups
driverOtpSchema.index({ phone: 1 });

const DriverOTP = mongoose.model('DriverOTP', driverOtpSchema);

module.exports = DriverOTP;