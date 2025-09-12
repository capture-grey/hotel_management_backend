const mongoose = require("mongoose");
const BookingHistory = require("../models/BookingHistory");

// Get booking history with simple analytics
const getBookingHistory = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    await session.startTransaction();

    // Get analytics (total revenue, total bookings, average stay)
    const analyticsPipeline = [
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$actualTotalAmount" },
          totalBookings: { $sum: 1 },
          averageStayDuration: { $avg: "$actualNightsStayed" },
        },
      },
    ];

    // Get paginated history
    const paginationPipeline = [
      { $sort: { checkOutDate: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    // Get total count
    const countPipeline = [{ $count: "total" }];

    const [analyticsResult, paginatedHistory, totalCountResult] =
      await Promise.all([
        BookingHistory.aggregate(analyticsPipeline).session(session),
        BookingHistory.aggregate(paginationPipeline).session(session),
        BookingHistory.aggregate(countPipeline).session(session),
      ]);

    await session.commitTransaction();
    session.endSession();

    const total = totalCountResult[0]?.total || 0;
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
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

module.exports = {
  getBookingHistory,
};
