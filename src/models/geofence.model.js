const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  type: {
    type: String,
    enum: ['service', 'restricted', 'surge'],
    default: 'service'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  radius: {
    type: Number,
    default: 10000 // 10km in meters
  },
  multiplier: {
    type: Number,
    default: 1.0,
    min: 1.0
  },
  active: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'  // Using existing Driver model
  }
}, {
  timestamps: true
});

// Create 2dsphere index for geospatial queries
geofenceSchema.index({ location: '2dsphere' });

const Geofence = mongoose.model('Geofence', geofenceSchema);

module.exports = Geofence;