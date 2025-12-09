// backend/models/Lead.js
import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  email: { type: String, required: true },
  zip: { type: String, required: true },
  partRequested: { type: String, required: false },
  make: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: String, required: false },
  trim: { type: String, required: false },
  status: {
    type: String,
    enum: [
      "Quoted",
      "No Response",
      "Wrong Number",
      "Not Interested",
      "Price too high",
      "Part not available",
      "Ordered",
    ],
    default: "Quoted",
  },
  salesPerson: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdBy: { type: Boolean, default: false },
  notes: [
    {
      text: String,
      addedBy: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  importantDates: [
    {
      date: { type: String, required: true },
      note: { type: String, default: "" },
    },
  ],
  partCost: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  grossProfit: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  warranty: { type: String, default: "0 months" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Lead || mongoose.model("Lead", leadSchema);