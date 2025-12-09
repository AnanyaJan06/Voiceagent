// backend/config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'test'  // ← YOUR REAL DATABASE
    });
    console.log('MongoDB Connected → test.leads collection');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

export default connectDB;