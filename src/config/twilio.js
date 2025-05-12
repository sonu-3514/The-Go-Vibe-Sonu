require('dotenv').config();

// Check for required Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize variables
let client = null;
let isConfigured = false;

// Only initialize if all credentials are present
if (accountSid && authToken && phoneNumber) {
  try {
    // Initialize Twilio client
    const twilio = require('twilio');
    client = twilio(accountSid, authToken);
    isConfigured = true;
    
    console.log('Twilio client initialized successfully');
    console.log('Using Twilio phone number:', phoneNumber);
    
    // Test Twilio account (async, doesn't block startup)
    (async () => {
      try {
        await client.api.accounts(accountSid).fetch();
        console.log('Twilio credentials verified successfully');
      } catch (error) {
        console.error('Twilio credentials verification failed:', error.message);
        console.error('SMS will not be sent. Please check your Twilio credentials.');
        isConfigured = false;
      }
    })();
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error.message);
  }
} else {
  console.warn('Twilio is not configured. SMS functionality will be limited.');
  console.warn('Missing Twilio credentials:', 
    !accountSid ? 'TWILIO_ACCOUNT_SID' : '', 
    !authToken ? 'TWILIO_AUTH_TOKEN' : '', 
    !phoneNumber ? 'TWILIO_PHONE_NUMBER' : '');
}

module.exports = {
  client,
  twilioPhoneNumber: phoneNumber,
  isConfigured
};