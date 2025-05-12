const axios = require('axios');
const logger = require('../utils/logger');

class FareService {
  /**
   * Calculate fare based on distance and vehicle type
   * @param {number} distance - Distance in kilometers
   * @param {string} vehicleType - Type of vehicle
   * @returns {Object} - Fare details including breakdown
   */
  static calculateFare(distance, vehicleType = 'Mini') {
    try {
      // Define base rates for different vehicle types
      const rates = {
        'Mini': { baseCharge: 50, perKm: 10, perMinute: 1.5 },
        'Primium': { baseCharge: 80, perKm: 15, perMinute: 2 },
        'Sedan': { baseCharge: 100, perKm: 18, perMinute: 2.5 },
        'SUV': { baseCharge: 150, perKm: 20, perMinute: 3 }
      };
      
      // Default to Mini if vehicle type not found
      const rate = rates[vehicleType] || rates['Mini'];
      
      // Calculate approximate duration (assuming average speed of 20 km/h)
      const estimatedMinutes = Math.ceil(distance * 3);
      
      // Calculate fare components
      const baseCharge = rate.baseCharge;
      const distanceCharge = rate.perKm * distance;
      const timeCharge = rate.perMinute * estimatedMinutes;
      
      // Apply minimum fare rule
      const calculatedFare = baseCharge + distanceCharge + timeCharge;
      const minimumFare = vehicleType === 'Mini' ? 50 : vehicleType === 'Primium' ? 80 : 100;
      const subtotal = Math.max(calculatedFare, minimumFare);
      
      // Apply tax
      const taxRate = 0.05; // 5% tax
      const tax = subtotal * taxRate;
      
      // Apply surge pricing if applicable
      // This would typically be determined by demand, time of day, etc.
      // For now, just use a simple time-based rule
      const hour = new Date().getHours();
      let surgeMultiplier = 1.0;
      
      // Apply surge between 8-10 AM and 5-8 PM
      if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
        surgeMultiplier = 1.2; // 20% surge
      }
      
      // Round to nearest integer
      const finalFare = Math.round((subtotal + tax) * surgeMultiplier);
      
      return {
        baseFare: finalFare,
        breakdown: {
          baseCharge,
          distanceCharge: parseFloat(distanceCharge.toFixed(2)),
          timeCharge: parseFloat(timeCharge.toFixed(2)),
          subtotal: parseFloat(subtotal.toFixed(2)),
          tax: parseFloat(tax.toFixed(2)),
          surgeMultiplier,
          total: finalFare
        },
        currency: 'INR',
        estimatedTime: {
          minutes: estimatedMinutes,
          formatted: `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`
        }
      };
    } catch (error) {
      logger.error('Error calculating fare:', error);
      // Provide a default response in case of error
      return {
        baseFare: 100,
        breakdown: {
          baseCharge: 50,
          distanceCharge: 50,
          timeCharge: 0,
          subtotal: 100,
          tax: 0,
          surgeMultiplier: 1,
          total: 100
        },
        currency: 'INR',
        estimatedTime: {
          minutes: 15,
          formatted: '0h 15m'
        }
      };
    }
  }

  static async calculateDistance(origin, destination) {
    try {
      // Validate origin and destination have lat/lng properties
      if (!origin || !origin.lat || !origin.lng) {
        throw new Error('Invalid origin coordinates');
      }
      
      if (!destination || !destination.lat || !destination.lng) {
        throw new Error('Invalid destination coordinates');
      }
      
      logger.info(`Calculating distance from (${origin.lat},${origin.lng}) to (${destination.lat},${destination.lng})`);
      
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Distance API error: ${response.data.status}`);
      }

      const element = response.data.rows[0].elements[0];
      
      if (element.status !== 'OK') {
        throw new Error(`Route calculation failed: ${element.status}`);
      }

      // Return distance in kilometers and duration
      return {
        distance: element.distance.value / 1000, // km
        duration: element.duration.text
      };
    } catch (error) {
      logger.error('Distance Calculation Error:', {
        message: error.message,
        config: error.config,
        response: error.response?.data
      });
      
      // Fallback: Calculate distance using Haversine formula
      if (origin && destination && origin.lat && origin.lng && destination.lat && destination.lng) {
        const haversineDistance = this.calculateHaversineDistance(
          origin.lat, origin.lng, 
          destination.lat, destination.lng
        );
        
        logger.info(`Using Haversine fallback. Calculated distance: ${haversineDistance.toFixed(2)} km`);
        
        return {
          distance: haversineDistance,
          duration: `~${Math.ceil(haversineDistance * 3)} mins`, // Rough estimate
          isEstimate: true
        };
      }
      
      throw new Error('Failed to calculate distance. Please try different locations.');
    }
  }
  
  // Fallback method: Calculate distance using Haversine formula
  static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
  }
  
  static deg2rad(deg) {
    return deg * (Math.PI/180);
  }
  
  static async getCoordinates(address) {
    try {
      // If address is already an object with latitude/longitude, return in Google format
      if (typeof address === 'object' && address !== null) {
        if (address.latitude !== undefined && address.longitude !== undefined) {
          return {
            lat: address.latitude,
            lng: address.longitude
          };
        }
        
        // If it already has lat/lng in Google format, just return it
        if (address.lat !== undefined && address.lng !== undefined) {
          return address;
        }
        
        // If it has an address field, use that for geocoding
        if (address.address) {
          address = address.address;
        } else {
          throw new Error('Invalid address format');
        }
      }
      
      if (typeof address !== 'string') {
        throw new Error('Address must be a string or an object with latitude/longitude');
      }
      
      logger.info(`Geocoding address: ${address}`);
      
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );
      
      if (response.data.status === 'ZERO_RESULTS') {
        throw new Error(`Address not found: ${address}`);
      }
      
      if (response.data.status !== 'OK') {
        throw new Error(`Geocoding API error: ${response.data.status}`);
      }

      return response.data.results[0].geometry.location;
    } catch (error) {
      logger.error('Geocoding Error:', error.response?.data || error.message);
      throw new Error(`Failed to get coordinates for: ${address}`);
    }
  }
}

module.exports = FareService;