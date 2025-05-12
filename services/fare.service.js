const axios = require('axios');
require('dotenv').config();

const VEHICLE_RATES = {
  RICKSHAW: parseFloat(process.env.RICKSHAW_RATE_PER_KM),
  MINI: parseFloat(process.env.MINI_RATE_PER_KM),
  PRIMIUM: parseFloat(process.env.PRIMIUM_RATE_PER_KM),
  PRIMIUMPLUSE: parseFloat(process.env.PRIMIUMPLUSE_RATE_PER_KM)
};

// Base fare + minimum charges by vehicle type
const BASE_FARE = {
  RICKSHAW: 20,
  MINI: 30,
  PRIMIUM: 50,
  PRIMIUMPLUSE: 80
};

// Minimum allowed fare discount percentage
const MIN_FARE_PERCENTAGE = 75; // User can't set fare below 75% of actual

async function calculateDistance(origin, destination) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: `${origin.latitude},${origin.longitude}`,
        destinations: `${destination.latitude},${destination.longitude}`,
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
      // Distance comes in meters, convert to kilometers
      const distanceInMeters = response.data.rows[0].elements[0].distance.value;
      return distanceInMeters / 1000; // Convert to kilometers
    } else {
      throw new Error('Unable to calculate distance');
    }
  } catch (error) {
    console.error('Error calculating distance:', error);
    throw error;
  }
}

async function calculateFare(origin, destination, vehicleType) {
  try {
    const distanceInKm = await calculateDistance(origin, destination);
    
    // Get rate for selected vehicle type
    const ratePerKm = VEHICLE_RATES[vehicleType];
    const baseFare = BASE_FARE[vehicleType];
    
    if (!ratePerKm) {
      throw new Error('Invalid vehicle type');
    }
    
    // Calculate fare: base fare + (distance * rate per km)
    const calculatedFare = baseFare + (distanceInKm * ratePerKm);
    
    // Round to nearest integer
    const roundedFare = Math.ceil(calculatedFare);
    
    return {
      distance: distanceInKm,
      fare: roundedFare,
      minAllowedFare: Math.ceil(roundedFare * (MIN_FARE_PERCENTAGE / 100))
    };
  } catch (error) {
    console.error('Error calculating fare:', error);
    throw error;
  }
}

function validateUserProposedFare(estimatedFare, userProposedFare) {
  const minAllowedFare = Math.ceil(estimatedFare * (MIN_FARE_PERCENTAGE / 100));
  return userProposedFare >= minAllowedFare;
}

module.exports = {
  calculateFare,
  validateUserProposedFare
};