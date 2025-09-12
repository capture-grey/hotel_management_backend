const mongoose = require("mongoose");
const BookingHistory = require("../models/BookingHistory");

// Get booking history with simple analytics
const getBookingHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get analytics (total revenue, total bookings, average stay)
    const analyticsResult = await BookingHistory.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$actualTotalAmount" },
          totalBookings: { $sum: 1 },
          averageStayDuration: { $avg: "$actualNightsStayed" },
        },
      },
    ]);

    // Get paginated history
    const paginatedHistory = await BookingHistory.find()
      .sort({ checkOutDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await BookingHistory.countDocuments();

    const analytics = analyticsResult[0] || {};

    res.status(200).json({
      success: true,
      data: paginatedHistory,
      analytics: {
        totalRevenue: analytics.totalRevenue || 0,
        totalBookings: analytics.totalBookings || 0,
        averageStayDuration: analytics.averageStayDuration || 0,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Booking history error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getBookingHistory,
};
