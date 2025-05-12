const axios = require('axios');
const logger = require('./logger');

/**
 * Geocoder utility for converting addresses to coordinates and vice versa
 */
class Geocoder {
  /**
   * Geocode an address to coordinates
   * @param {string} address - The address to geocode
   * @returns {Promise<{lat: number, lng: number}>} - The coordinates
   */
  async geocode(address) {
    try {
      logger.info('Executing geocoder.geocode'); // Debug to confirm execution
      if (!address || typeof address !== 'string') {
        logger.error('Invalid address provided for geocoding', { address });
        throw new Error('Valid address is required');
      }

      logger.debug(`Geocoding address: ${address}`);
      
      // If in test mode or GOOGLE_MAPS_API_KEY is not set, return mock coordinates
      if (process.env.NODE_ENV === 'test' || !process.env.GOOGLE_MAPS_API_KEY) {
        logger.debug(`Using mock coordinates for address: ${address}`);
        
        // Mock coordinates for Bangalore locations
        const mockResults = {
          '123 Main St, Bangalore': { lat: 12.9716, lng: 77.5946 },
          '456 Park Ave, Bangalore': { lat: 12.9352, lng: 77.6231 },
          'MG Road, Bangalore': { lat: 12.9757, lng: 77.6068 },
          'Koramangala 4th Block, Bangalore': { lat: 12.9328, lng: 77.6300 },
          // Default Bangalore coordinates
          'Bangalore': { lat: 12.9716, lng: 77.5946 }
        };

        const result = mockResults[address] || mockResults['Bangalore'];
        logger.debug(`Mock geocoding result for ${address}: lat=${result.lat}, lng=${result.lng}`);
        return result;
      }
      
      logger.debug('Calling Google Maps Geocoding API', { address });
      // Retry logic for rate limits
      for (let i = 0; i < 3; i++) {
        try {
          const response = await axios.get(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
          );
          
          if (response.data.status === 'ZERO_RESULTS') {
            logger.warn(`Address not found: ${address}`);
            return { lat: 12.9716, lng: 77.5946 }; // Default Bangalore coordinates
          }
          
          if (response.data.status !== 'OK') {
            logger.error(`Geocoding API error: ${response.data.status}`, { error: response.data.error_message });
            return { lat: 12.9716, lng: 77.5946 }; // Default Bangalore coordinates
          }

          const location = response.data.results[0].geometry.location;
          logger.debug(`Geocoded ${address} to coordinates: lat=${location.lat}, lng=${location.lng}`);
          
          return {
            lat: location.lat,
            lng: location.lng
          };
        } catch (error) {
          if (error.response?.data?.status === 'OVER_QUERY_LIMIT' && i < 2) {
            logger.warn(`Rate limit hit, retrying (${i + 1}/3)`, { address });
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      logger.error(`Geocoding error for address "${address}": ${error.message}`);
      return { lat: 12.9716, lng: 77.5946 }; // Default Bangalore coordinates
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<string>} - The address
   */
  async reverseGeocode(lat, lng) {
    try {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        logger.error('Invalid coordinates provided for reverse geocoding', { lat, lng });
        throw new Error('Valid latitude and longitude are required');
      }

      logger.debug(`Reverse geocoding coordinates: ${lat}, ${lng}`);
      
      // If we're in test mode or GOOGLE_MAPS_API_KEY is not set, return mock address
      if (process.env.NODE_ENV === 'test' || !process.env.GOOGLE_MAPS_API_KEY) {
        logger.warn('Using mock address for reverse geocoding');
        return 'Bangalore, Karnataka, India';
      }
      
      logger.debug('Calling Google Maps Reverse Geocoding API', { lat, lng });
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
      );
      
      if (response.data.status === 'ZERO_RESULTS') {
        logger.warn(`No address found for coordinates: ${lat},${lng}`);
        return 'Unknown location in Bangalore';
      }
      
      if (response.data.status !== 'OK') {
        logger.error(`Reverse geocoding API error: ${response.data.status}`, { error: response.data.error_message });
        return 'Location in Bangalore';
      }

      const address = response.data.results[0].formatted_address;
      logger.debug(`Reverse geocoded ${lat},${lng} to address: ${address}`);
      
      return address;
    } catch (error) {
      logger.error(`Reverse geocoding error for coordinates ${lat},${lng}: ${error.message}`);
      return 'Location in Bangalore';
    }
  }
}

// Export singleton instance
module.exports = new Geocoder();