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
    vehicleType: {
        type: String,
        enum: ['bike', 'car', 'auto', 'premium'],
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create 2dsphere index for geospatial queries
driverLocationSchema.index({ 'location.coordinates': '2dsphere' });

const DriverLocation = mongoose.model('DriverLocation', driverLocationSchema);

module.exports = DriverLocation;