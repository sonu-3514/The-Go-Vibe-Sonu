const jwt = require('jsonwebtoken');
const Driver = require('../models/driver.model');
const { JWT_SECRET, JWT_EXPIRES_IN } = process.env;


exports.getDriverByMobileNumber = async (mobileNumber) => {
  return Driver.findOne({ mobileNumber });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

exports.createDriver = async (mobileNumber) => {
  return Driver.create({ mobileNumber });
};

exports.generateToken = (driverId) => {
  return jwt.sign({ id: driverId }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

// Add or update this method
exports.updateDriver = async (driverId, updateData) => {
    try {
        console.log(`Attempting to update driver ${driverId} with data:`, updateData);
        
        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { $set: updateData },
            { new: true, runValidators: true }
        );
        
        if (!driver) {
            console.error(`Driver with ID ${driverId} not found`);
            throw new Error('Driver not found');
        }
        
        console.log(`Driver ${driverId} updated successfully`);
        return driver;
    } catch (error) {
        console.error(`Error updating driver ${driverId}:`, error);
        throw error;
    }
};
