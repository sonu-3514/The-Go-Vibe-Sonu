const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },
  vehicleType: {
    type: String,
    required: true,
    enum: ['Rickshaw', 'Mini', 'Premium', 'Premium+'],
  },
  vehicleModel: {
    type: String,
    required: true,
  },
  vehicleColor: {
    type: String,
    required: true,
  },
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
  },
  licensePlate: {
    type: String,
    required: true,
    sparse: true,
    unique: true,
  },
});

module.exports = mongoose.model('Vehicle', vehicleSchema);