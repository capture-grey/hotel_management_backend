const mongoose = require("mongoose");
const BookingHistory = require("../models/BookingHistory");

// Get booking history with filter-based analytics
const getBookingHistory = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const {
      reportType,
      roomType,
      roomNo,
      status,
      startDate,
      endDate,
      minNights,
      maxNights,
      guestName,
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    await session.startTransaction();

    let pipeline = [];
    const matchStage = {};

    // Add filters
    if (roomType) matchStage.roomType = roomType;
    if (roomNo) matchStage.roomNo = parseInt(roomNo);
    if (status) matchStage.status = status;
    if (guestName) matchStage.guestName = new RegExp(guestName, "i");

    // Date range filter
    if (startDate || endDate) {
      matchStage.checkOutDate = {};
      if (startDate) matchStage.checkOutDate.$gte = new Date(startDate);
      if (endDate) matchStage.checkOutDate.$lte = new Date(endDate);
    }

    // Nights stayed filter
    if (minNights || maxNights) {
      matchStage.actualNightsStayed = {};
      if (minNights) matchStage.actualNightsStayed.$gte = parseInt(minNights);
      if (maxNights) matchStage.actualNightsStayed.$lte = parseInt(maxNights);
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Different aggregation based on report type
    switch (reportType) {
      case "dashboard-stats":
        pipeline.push(
          {
            $facet: {
              analytics: [
                {
                  $group: {
                    _id: null,
                    totalRevenue: { $sum: "$actualTotalAmount" },
                    totalBookings: { $sum: 1 },
                    averageStayDuration: { $avg: "$actualNightsStayed" },
                  },
                },
              ],
              statusBreakdown: [
                {
                  $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                  },
                },
                {
                  $addFields: {
                    percentage: {
                      $multiply: [
                        { $divide: ["$count", { $sum: "$count" }] },
                        100,
                      ],
                    },
                  },
                },
              ],
            },
          },
          {
            $project: {
              totalRevenue: { $arrayElemAt: ["$analytics.totalRevenue", 0] },
              totalBookings: { $arrayElemAt: ["$analytics.totalBookings", 0] },
              averageStayDuration: {
                $arrayElemAt: ["$analytics.averageStayDuration", 0],
              },
              statusBreakdown: 1,
            },
          }
        );
        break;

      case "total-revenue":
        pipeline.push({
          $group: {
            _id: null,
            totalRevenue: { $sum: "$actualTotalAmount" },
            totalBookings: { $sum: 1 },
            totalNights: { $sum: "$actualNightsStayed" },
            averageRevenuePerBooking: { $avg: "$actualTotalAmount" },
          },
        });
        break;

      case "revenue-by-room-type":
        pipeline.push({
          $group: {
            _id: "$roomType",
            totalRevenue: { $sum: "$actualTotalAmount" },
            bookingCount: { $sum: 1 },
            averageStay: { $avg: "$actualNightsStayed" },
            rooms: { $addToSet: "$roomNo" },
          },
        });
        break;

      case "revenue-by-room-no":
        pipeline.push({
          $group: {
            _id: "$roomNo",
            roomType: { $first: "$roomType" },
            totalRevenue: { $sum: "$actualTotalAmount" },
            bookingCount: { $sum: 1 },
            totalNights: { $sum: "$actualNightsStayed" },
            averageRevenuePerNight: {
              $avg: { $divide: ["$actualTotalAmount", "$actualNightsStayed"] },
            },
          },
        });
        break;

      case "revenue-by-month":
        pipeline.push(
          {
            $group: {
              _id: {
                year: { $year: "$checkOutDate" },
                month: { $month: "$checkOutDate" },
              },
              totalRevenue: { $sum: "$actualTotalAmount" },
              bookingCount: { $sum: 1 },
              monthName: {
                $first: {
                  $arrayElemAt: [
                    [
                      "",
                      "Jan",
                      "Feb",
                      "Mar",
                      "Apr",
                      "May",
                      "Jun",
                      "Jul",
                      "Aug",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dec",
                    ],
                    { $month: "$checkOutDate" },
                  ],
                },
              },
            },
          },
          {
            $sort: { "_id.year": 1, "_id.month": 1 },
          }
        );
        break;

      case "average-stay-duration":
        pipeline.push({
          $group: {
            _id: null,
            averageStayDuration: { $avg: "$actualNightsStayed" },
            minStay: { $min: "$actualNightsStayed" },
            maxStay: { $max: "$actualNightsStayed" },
            totalBookings: { $sum: 1 },
          },
        });
        break;

      case "guest-repeat-count":
        pipeline.push(
          {
            $group: {
              _id: "$guestName",
              visitCount: { $sum: 1 },
              totalSpent: { $sum: "$actualTotalAmount" },
              totalNights: { $sum: "$actualNightsStayed" },
              lastVisit: { $max: "$checkOutDate" },
            },
          },
          {
            $match: { visitCount: { $gt: 1 } },
          },
          {
            $sort: { visitCount: -1 },
          }
        );
        break;

      case "stay-comparison":
        pipeline.push({
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalRevenue: { $sum: "$actualTotalAmount" },
            averageNights: { $avg: "$actualNightsStayed" },
            percentage: {
              $avg: {
                $cond: [{ $ne: ["$status", null] }, 100, 0],
              },
            },
          },
        });
        break;

      default:
        // For regular history requests, get both analytics and paginated data
        const analyticsPipeline = [...pipeline];
        analyticsPipeline.push({
          $group: {
            _id: null,
            totalRevenue: { $sum: "$actualTotalAmount" },
            totalBookings: { $sum: 1 },
            averageStayDuration: { $avg: "$actualNightsStayed" },
          },
        });

        const paginationPipeline = [
          ...pipeline,
          { $sort: { checkOutDate: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) },
        ];

        const [analyticsResult, paginatedHistory, totalCountResult] =
          await Promise.all([
            BookingHistory.aggregate(analyticsPipeline).session(session),
            BookingHistory.aggregate(paginationPipeline).session(session),
            BookingHistory.aggregate([
              ...pipeline,
              { $count: "total" },
            ]).session(session),
          ]);

        await session.commitTransaction();
        session.endSession();

        const total = totalCountResult[0]?.total || 0;
        const analytics = analyticsResult[0] || {};

        return res.status(200).json({
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
          filters: {
            roomType,
            roomNo,
            status,
            startDate,
            endDate,
            minNights,
            maxNights,
            guestName,
          },
        });
    }

    // For report types, execute the pipeline
    const result = await BookingHistory.aggregate(pipeline).session(session);

    await session.commitTransaction();
    session.endSession();

    if (reportType) {
      // For reports, return just the aggregated data
      res.status(200).json({
        success: true,
        data: result,
        reportType,
      });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

module.exports = {
  getBookingHistory,
};
