const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const rideSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Made optional to avoid validation errors
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
  },
  pickupLocation: {
    address: String,
    lat: Number,
    lng: Number,
    coordinates: [Number], // [longitude, latitude]
    type: {
      type: String,
      default: 'Point',
    },
  },
  dropoffLocation: {
    address: String,
    lat: Number,
    lng: Number,
    coordinates: [Number], // [longitude, latitude]
    type: {
      type: String,
      default: 'Point',
    },
  },
  distance: {
    type: Number,
    required: true,
  },
  estimatedFare: {
    type: Number,
    required: true,
  },
  userProposedFare: {
    type: Number,
  },
  finalFare: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'confirmed', 'arrived', 'started', 'completed', 'cancelled'],
    default: 'pending',
  },
  vehicleType: { type: String, enum: ['premium', 'taxi', 'electric', 'mini'] },
  distance: Number,
  duration: String,
  fare: {
    base: Number,
    offered: Number,
    accepted: Boolean
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'Wallet'],
    default: 'Cash',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
  },
  specialInstructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Special instructions cannot exceed 500 characters']
  },
  acceptedAt: Date,
  confirmedAt: Date,
  arrivedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  cancelledBy: {
    type: String,
    enum: ['user', 'driver', 'system'],
  },
  acceptedDrivers: [{
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    driverDetails: {
      name: String,
      phone: String,
      vehicleDetails: {
        type: String,
        model: String,
        color: String,
        licensePlate: String,
      },
      rating: Number,
      photo: String,
    },
    distanceToPickup: Number,
    estimatedTimeMinutes: Number,
    acceptedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  driverLocationHistory: [{
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  expiresAt: {
    type: Date,
    default: function () {
      return new Date(Date.now() + 10 * 60 * 1000);
    },
  },
  isExpired: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Geospatial indexes
rideSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
rideSchema.index({ 'dropoffLocation.coordinates': '2dsphere' });
rideSchema.index({ status: 1, userId: 1 });
rideSchema.index({ status: 1, driverId: 1 });
rideSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save hook to log userId issues
rideSchema.pre('save', function (next) {
  if (this.userId) {
    console.log('Ride userId:', this.userId);
  } else {
    console.warn('Ride created without userId');
  }
  next();
});

// Check if ride is expired
rideSchema.methods.checkExpired = function () {
  return this.isExpired || (this.expiresAt && this.expiresAt < new Date());
};

module.exports = mongoose.model('Ride', rideSchema);