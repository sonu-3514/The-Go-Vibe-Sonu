const mongoose = require('mongoose');
const { isDevMode } = require('../utils/helpers');

const driverSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: function () {
      return this.isRegistered === true;
    },
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
},
email: {
  type: String,
  trim: true,
  lowercase: true,
  unique: true,  // Add this if you want unique emails
  sparse: true,  // Add this to allow multiple documents with null/undefined email
  validate: {
    validator: function(v) {
      // Skip validation if email is not provided or driver isn't registered
      if (!v && !this.isRegistered) return true;
      
      // If email is provided, make sure it's properly formatted
      if (v) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      }
      
      // If driver is registered but no email, it's invalid
      return false;
    },
    message: props => `${props.value} is not a valid email!`
  },
  // Only required if driver is registered
  required: function() {
    return this.isRegistered === true;
  }
},
 
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isRegistered: {
    type: Boolean,
    default: false,
  },
  isApproved: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'busy', 'suspended'],
    default: 'offline',
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      default: [0, 0],
    },
  },
  vehicleDetails: {
    type: {
      type: String,
      enum: ['Rickshaw', 'Mini', 'Premium', 'Premium+'], // Aligned with Vehicle model
      required: function () {
        return this.isRegistered === true;
      },
    },
    model: String,
    color: String,
    licensePlate: String,
    year: Number,
  },
  documents: {
    drivingLicense: String,
    vehicleRegistration: String,
    insurance: String,
  },
  baseFare: {
    type: Number,
    required: function () {
      return this.isRegistered === true;
    },
  },
  carType: {
    type: String,
    required: function () {
      return this.isRegistered === true;
    },
  },
  dob: {
    type: Date,
    required: !isDevMode(),
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: !isDevMode(),
  },
  aadharCard: {
    type: String,
    required: !isDevMode(),
  },
  panCard: {
    type: String,
    required: !isDevMode(),
  },
  drivingLicense: {
    number: String,
    expiryDate: Date,
    verified: {
      type: Boolean,
      default: false,
    },
  },
  registrationCompleted: {
    type: Boolean,
    default: false,
  },
  otp: {
    type: String,
  },
  otpExpiry: {
    type: Date,
  },
  licenseNumber: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  rating: {
    type: Number,
    default: 5,
    min: 1,
    max: 5,
  },
  totalRides: {
    type: Number,
    default: 0,
  },
  wallet: {
    balance: {
      type: Number,
      default: 0,
    },
    transactions: [
      {
        amount: Number,
        type: {
          type: String,
          enum: ['credit', 'debit'],
        },
        description: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
}, {
  timestamps: true,
});

// Define indexes
driverSchema.index({ currentLocation: '2dsphere' }); // Single 2dsphere index for geospatial queries
driverSchema.index({ isActive: 1, isApproved: 1 }); // Compound index for driver search
driverSchema.index({ isActive: 1, status: 1 }); // Compound index for status queries

// Pre-save hook to ensure proper GeoJSON structure
driverSchema.pre('save', function (next) {
  if (this.currentLocation && this.currentLocation.coordinates) {
    this.currentLocation.type = 'Point';
    this.currentLocation.coordinates = this.currentLocation.coordinates.map((coord) =>
      typeof coord === 'string' ? parseFloat(coord) : coord
    );
  }
  next();
});

// Pre-update hook for GeoJSON structure
driverSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.currentLocation && update.currentLocation.coordinates) {
    update.currentLocation.type = 'Point';
    update.currentLocation.coordinates = update.currentLocation.coordinates.map((coord) =>
      typeof coord === 'string' ? parseFloat(coord) : coord
    );
  }
  next();
});

const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;