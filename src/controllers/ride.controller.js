const LocationService = require('../services/location.service');
const FareService = require('../services/fare.service');

exports.estimateFare = async (req, res) => {
  try {
    const { pickup, destination } = req.body;
    
    if (!pickup || !destination) {
      return res.status(400).json({ 
        error: 'Missing required fields: pickup or destination' 
      });
    }

    const pickupCoords = await LocationService.getCoordinates(pickup);
    const destCoords = await LocationService.getCoordinates(destination);
    
    const { distance } = await LocationService.calculateDistance(pickupCoords, destCoords);
    
    // Calculate fares for all vehicle types
    const fares = {
      premium: FareService.calculateFare(distance, 'premium'),
      taxi: FareService.calculateFare(distance, 'taxi'),
      electric: FareService.calculateFare(distance, 'electric'),
      mini: FareService.calculateFare(distance, 'mini')
    };
    
    res.json({
      success: true,
      pickup,
      destination,
      distance: `${distance.toFixed(2)} km`,
      fares
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};