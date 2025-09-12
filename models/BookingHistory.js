const mongoose = require("mongoose");

const bookingHistorySchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    guestName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    roomNo: {
      type: Number,
      required: true,
    },
    roomType: {
      type: String,
      required: true,
      enum: ["single", "double", "suite"],
    },
    checkInDate: {
      type: Date,
      required: true,
    },
    checkOutDate: {
      type: Date,
      required: true,
    },
    nights: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    actualNightsStayed: {
      type: Number,
      required: true,
      min: 1,
    },
    actualTotalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["completed", "early_checkout", "extended_stay"],
      default: "completed",
    },
  },
  { timestamps: true }
);

const BookingHistory = mongoose.model("BookingHistory", bookingHistorySchema);

module.exports = BookingHistory;
