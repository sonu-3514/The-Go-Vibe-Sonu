const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pickup: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  destination: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  vehicleType: { type: String, enum: ['premium', 'taxi', 'electric', 'mini'] },
  distance: Number,
  duration: String,
  fare: {
    base: Number,
    offered: Number,
    accepted: Boolean
  },
  paymentMethod: { type: String, enum: ['cash', 'upi', 'card'] },
  status: { type: String, enum: ['pending', 'accepted', 'completed', 'cancelled'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Ride', rideSchema);