const express = require("express");
const dotenv = require("dotenv");
const serverless = require("serverless-http");
const cors = require("cors");
const connectDB = require("./config/db");

const authRouter = require("./router/authRouter");
const roomRouter = require("./router/roomRouter");
const bookingRouter = require("./router/bookingRouter");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");

dotenv.config();
connectDB();

const app = express();

app.use(cors()); // allow all origins
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "Hello from Hotel Management API" });
});

app.use("/api/auth", authRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/bookings", bookingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports.handler = serverless(app);
