const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomNo: {
      type: Number,
      required: [true, "Room number is required"],
      unique: true,
    },
    type: {
      type: String,
      required: [true, "Room type is required"],
      enum: ["single", "double", "suite"],
    },
    beds: {
      type: Number,
      required: [true, "Number of beds is required"],
      min: [1, "At least one bed required"],
    },
    pricePerNight: {
      type: Number,
      required: [true, "Price per night is required"],
      min: [0, "Price cannot be negative"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    available: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
