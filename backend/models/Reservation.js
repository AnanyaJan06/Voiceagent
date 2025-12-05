// backend/models/Reservation.js
import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema({
  callSid: { type: String, required: true },
  customerPhone: { type: String, required: true },
  partRequested: String,
  vehicle: String,
  customerName: String,
  shippingAddress: String,
  pincode: String,
  status: { type: String, default: 'reserved' },
  reservedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);