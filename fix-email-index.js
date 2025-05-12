require('dotenv').config();
const mongoose = require('mongoose');

// Get MongoDB URI from environment variables
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/the-go-vibe';

console.log('Attempting to connect to MongoDB...');

mongoose.connect(MONGO_URI)
  .then(async (connection) => {
    console.log('Connected to MongoDB');
    
    try {
      // Get the User collection directly
      const userCollection = connection.connection.db.collection('users');
      
      // Step 1: List all indexes
      const indexes = await userCollection.indexes();
      console.log('Current indexes:', indexes.map(index => index.name));
      
      // Step 2: Drop all problematic indexes
      for (const index of indexes) {
        if (index.name !== '_id_' && index.name.includes('email')) {
          await userCollection.dropIndex(index.name);
          console.log(`Dropped index: ${index.name}`);
        }
      }
      
      // Step 3: Clear null emails (set to undefined instead which won't be indexed)
      const updateResult = await userCollection.updateMany(
        { email: null }, 
        { $unset: { email: "" } }
      );
      
      console.log(`Updated ${updateResult.modifiedCount} users with null emails`);
      
      // Step 4: Create a proper sparse index
      await userCollection.createIndex(
        { email: 1 }, 
        { 
          unique: true, 
          sparse: true,
          name: "email_sparse_unique"
        }
      );
      
      console.log('Created new sparse unique email index');
      
      // Step 5: Verify the changes
      const newIndexes = await userCollection.indexes();
      console.log('Updated indexes:', newIndexes.map(index => index.name));
      
      console.log('Database fix completed successfully');
    } catch (error) {
      console.error('Error fixing database:', error);
    } finally {
      // Close the connection
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });