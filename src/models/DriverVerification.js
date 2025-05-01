const mongoose = require('mongoose');

const driverVerificationSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  aadharVerified: {
    type: Boolean,
    default: false,
  },
  panVerified: {
    type: Boolean,
    default: false,
  },
  licenseVerified: {
    type: Boolean,
    default: false,
  },
  processingTime: {
    type: Date,
    default: Date.now,
  },
});

const DriverVerification = mongoose.model('DriverVerification', driverVerificationSchema);

module.exports = DriverVerification;
