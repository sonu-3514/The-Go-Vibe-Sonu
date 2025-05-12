const axios = require('axios');
const logger = require('./logger');

// Fallback distance calculation when API is unavailable
function calculateDistanceSimple(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Simple geocoding function that doesn't require API key
// Uses fallback coordinates for common locations
exports.geocodeAddressSimple = async (address) => {
  logger.info(`Simple geocoding for address: ${address}`);
  
  // Define fallback coordinates for common locations
  const knownLocations = {
    'bangalore': { lat: 12.9716, lng: 77.5946 },
    'delhi': { lat: 28.6139, lng: 77.2090 },
    'mumbai': { lat: 19.0760, lng: 72.8777 },
    'chennai': { lat: 13.0827, lng: 80.2707 },
    'kolkata': { lat: 22.5726, lng: 88.3639 },
    'hyderabad': { lat: 17.3850, lng: 78.4867 },
    'airport': { lat: 13.1986, lng: 77.7066 }, // Bangalore airport
    'station': { lat: 12.9782, lng: 77.5737 } // Bangalore railway station
  };
  
  // Check if address contains any known location keywords
  const addressLower = address.toLowerCase();
  for (const [key, coords] of Object.entries(knownLocations)) {
    if (addressLower.includes(key)) {
      logger.info(`Found known location match: ${key}`);
      return {
        lat: coords.lat,
        lng: coords.lng,
        formattedAddress: address
      };
    }
  }
  
  // Default to Bangalore center if no match
  logger.info('No location match found, using default (Bangalore)');
  return {
    lat: 12.9716,
    lng: 77.5946,
    formattedAddress: address + ' (approximate location)'
  };
};

// Calculate distance between two points using simple calculation
exports.getDistanceMatrixSimple = async (origins, destinations) => {
  try {
    logger.info(`Calculating simple distance matrix between ${origins} and ${destinations}`);
    
    // Parse coordinates
    let originCoords, destCoords;
    
    if (typeof origins === 'string') {
      const parts = origins.split(',');
      originCoords = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
    } else {
      originCoords = origins;
    }
    
    if (typeof destinations === 'string') {
      const parts = destinations.split(',');
      destCoords = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
    } else {
      destCoords = destinations;
    }
    
    // Calculate distance
    const distance = calculateDistanceSimple(
      originCoords.lat, originCoords.lng,
      destCoords.lat, destCoords.lng
    );
    
    // Calculate average driving time (assume 40 km/h average speed)
    const durationInSeconds = (distance / 40) * 3600; // hours to seconds
    
    return {
      status: 'OK',
      rows: [{
        elements: [{
          status: 'OK',
          distance: {
            text: `${distance.toFixed(1)} km`,
            value: Math.round(distance * 1000) // Convert to meters
          },
          duration: {
            text: `${Math.round(durationInSeconds / 60)} mins`,
            value: Math.round(durationInSeconds)
          }
        }]
      }]
    };
  } catch (error) {
    logger.error('Error calculating simple distance matrix:', error);
    throw error;
  }
};

// Main export functions that don't require API keys
exports.geocodeAddress = exports.geocodeAddressSimple;
exports.getDistanceMatrix = exports.getDistanceMatrixSimple;

// Get directions (simplified version)
exports.getDirections = async (origin, destination) => {
  try {
    logger.info(`Getting directions between ${origin} and ${destination}`);
    
    // Calculate distance
    const distanceMatrix = await exports.getDistanceMatrixSimple(origin, destination);
    
    // Return simplified directions response
    return {
      status: 'OK',
      routes: [{
        legs: [{
          distance: distanceMatrix.rows[0].elements[0].distance,
          duration: distanceMatrix.rows[0].elements[0].duration,
          start_location: typeof origin === 'string' ? origin.split(',') : origin,
          end_location: typeof destination === 'string' ? destination.split(',') : destination,
          steps: []
        }]
      }]
    };
  } catch (error) {
    logger.error('Error getting simple directions:', error);
    throw error;
  }
};