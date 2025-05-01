require('dotenv').config();

// Check for required Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Validate required credentials
if (!accountSid || !authToken || !phoneNumber) {
  console.error('ERROR: Missing Twilio credentials in environment variables');
  console.error('Make sure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are set');
}

// Initialize Twilio client
const client = require('twilio')(accountSid, authToken);

// Create a test function to verify Twilio works
const testTwilio = async () => {
  try {
    const response = await client.api.accounts(accountSid).fetch();
    console.log('Twilio credentials verified successfully');
    return true;
  } catch (error) {
    console.error('Twilio credentials validation failed:', error.message);
    return false;
  }
};

// Run the test immediately
testTwilio();

module.exports = {
  client,
  twilioPhoneNumber: phoneNumber,
  isConfigured: Boolean(accountSid && authToken && phoneNumber)
};