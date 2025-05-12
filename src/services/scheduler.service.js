const Ride = require('../models/ride.model');
const logger = require('../utils/logger');

class SchedulerService {
  constructor(socketService) {
    this.socketService = socketService;
    this.expireRidesInterval = null;
  }
  
  start() {
    // Run the expiry check every minute
    this.expireRidesInterval = setInterval(
      () => this.checkExpiredRides(), 
      60 * 1000
    );
    logger.info('Scheduler service started');
  }
  
  stop() {
    if (this.expireRidesInterval) {
      clearInterval(this.expireRidesInterval);
      this.expireRidesInterval = null;
    }
    logger.info('Scheduler service stopped');
  }
  
  async checkExpiredRides() {
    try {
      logger.debug('Checking for expired rides...');
      
      // Find pending rides that have expired
      const now = new Date();
      const expiredRides = await Ride.find({
        status: 'pending',
        isExpired: false,
        expiresAt: { $lt: now }
      });
      
      logger.debug(`Found ${expiredRides.length} expired rides`);
      
      for (const ride of expiredRides) {
        // Mark ride as expired
        ride.isExpired = true;
        ride.status = 'expired';
        await ride.save();
        
        // Notify user about ride expiration
        if (this.socketService) {
          this.socketService.io.to(`user_${ride.userId}`).emit('rideExpired', {
            rideId: ride._id,
            message: 'Your ride request has expired. No drivers accepted within 10 minutes.'
          });
          
          // Notify any drivers who were viewing this ride that it's no longer available
          this.socketService.io.emit('rideNoLongerAvailable', {
            rideId: ride._id,
            reason: 'expired'
          });
        }
        
        logger.info(`Marked ride ${ride._id} as expired`);
      }
    } catch (error) {
      logger.error('Error checking expired rides:', error);
    }
  }
}

module.exports = SchedulerService;