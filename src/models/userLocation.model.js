const mongoose = require('mongoose');

const userLocationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create 2dsphere index for geospatial queries
userLocationSchema.index({ 'location.coordinates': '2dsphere' });

const UserLocation = mongoose.model('UserLocation', userLocationSchema);

module.exports = UserLocation;