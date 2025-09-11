const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    guestName: {
      type: String,
      required: [true, "Guest name is required"],
      trim: true,
      maxlength: [50, "Guest name cannot exceed 50 characters"],
    },
    nights: {
      type: Number,
      required: [true, "Number of nights is required"],
      min: [1, "At least 1 night must be booked"],
    },
    checkInDate: {
      type: Date,
      required: [true, "Check-in date is required"],
    },
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
