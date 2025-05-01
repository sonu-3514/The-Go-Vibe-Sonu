const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  mobileNumber: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Set expiry 10 minutes from now
      return new Date(Date.now() + 10 * 60 * 1000); 
    },
    index: { expires: '10m' } // MongoDB TTL index
  },
});

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;