class FareService {
    static calculateFare(distance, vehicleType) {
      const rates = {
        premium: process.env.PREMIUM_RATE_PER_KM || 25,
        taxi: process.env.TAXI_RATE_PER_KM || 18,
        electric: process.env.ELECTRIC_RATE_PER_KM || 20,
        mini: process.env.MINI_RATE_PER_KM || 15
      };
      
      const baseFare = distance * rates[vehicleType];
      return {
        baseFare: Math.round(baseFare),
        minAllowed: Math.round(baseFare * 0.75), // 25% less
        // maxAllowed: Math.round(baseFare * 1.10)  // 10% more
      };
    }
  }
  
module.exports = FareService;