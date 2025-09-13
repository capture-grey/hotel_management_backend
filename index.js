// external imports
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const serverless = require("serverless-http");
const cors = require("cors");

// internal imports
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const connectDB = require("./config/db.js");

const authRouter = require("./router/authRouter");
const roomRouter = require("./router/roomRouter");
const bookingRouter = require("./router/bookingRouter");

// create express app
const app = express();

// env
dotenv.config();
connectDB();

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "https://hotel-management-frontend-fawn.vercel.app",
  "https://hotel-management-frontend-fawn.vercel.app/", // Add with and without trailing slash
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Apply CORS middleware before routes
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

// parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// routes
app.get("/", (req, res) => {
  res.status(200).json({ message: "Hello From Hotel Management API" });
});

app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/bookings", bookingRouter);

// error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// export for vercel
module.exports = app;
module.exports.handler = serverless(app);
