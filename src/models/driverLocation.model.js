const mongoose = require('mongoose');

const driverLocationSchema = new mongoose.Schema({
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true
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
    isAvailable: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    vehicleType: {
        type: String,
        enum: ['Rickshaw', 'Mini', 'Premium', 'Premium+'],
        default: 'Mini'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create the 2dsphere index for geospatial queries
driverLocationSchema.index({ location: '2dsphere' });

const DriverLocation = mongoose.model('DriverLocation', driverLocationSchema);

module.exports = DriverLocation;