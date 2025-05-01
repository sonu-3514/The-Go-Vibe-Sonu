const axios = require('axios');

class LocationService {
  static async getCoordinates(address) {
    try {
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
      console.error('Geocoding Error:', error.response?.data || error.message);
      throw new Error(`Failed to get coordinates for: ${address}`);
    }
  }

  static async calculateDistance(origin, destination) {
    try {
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

      return {
        distance: element.distance.value / 1000, // km
        duration: element.duration.text
      };
    } catch (error) {
      console.error('Distance Calculation Error:', {
        config: error.config,
        response: error.response?.data
      });
      throw new Error('Failed to calculate distance. Please try different locations.');
    }
  }
}

module.exports = LocationService;