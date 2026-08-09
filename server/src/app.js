require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const path = require("path");

const errorHandler = require("./middleware/errorHandler");

// Routes
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const farmerRoutes = require("./routes/farmer.routes");
const paymentRoutes = require("./routes/payment.routes");
const adminRoutes = require("./routes/admin.routes");
const reviewRoutes = require("./routes/review.routes");
const addressRoutes = require("./routes/address.routes");
const notificationRoutes = require("./routes/notification.routes");
const deliveryRoutes = require("./routes/delivery.routes");
const wishlistRoutes = require("./routes/wishlist.routes");
const cartRoutes = require("./routes/cart.routes");
const complaintRoutes = require("./routes/complaint.routes");
const faceRoutes = require("./routes/face.routes");

const app = express();
app.set('trust proxy', 1);
/*
=================================
CORS
=================================
*/
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.options("*", cors());
/*
=================================
BODY PARSERS
=================================
*/
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/*
=================================
SECURITY
=================================
*/
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(mongoSanitize());
app.use(hpp());
app.use(compression());

/*
=================================
RATE LIMITERS
=================================
*/
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: "Too many requests, try again later.",
  },
});

app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many auth attempts, try again later.",
  },
});

const faceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many face authentication attempts, try again later.",
  },
});

if (process.env.NODE_ENV === "production") {
  app.use("/api/v1/auth", authLimiter);
}
app.use("/api/v1/face/verify", faceLimiter);

/*
=================================
LOGGING
=================================
*/
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/*
=================================
STATIC FILES
=================================
*/
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

/*
=================================
API ROUTES
=================================
*/
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/farmers", farmerRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/delivery", deliveryRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/complaints", complaintRoutes);

// Face auth routes — increased body limit for base64 images
app.use("/api/v1/face", express.json({ limit: "5mb" }), faceRoutes);

/*
=================================
HEALTH CHECK
=================================
*/
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Farm2Door API is running",
    timestamp: new Date().toISOString(),
  });
});

/*
=================================
PRODUCTION BUILD
=================================
*/
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../client/dist")));

  app.get("*", (req, res) => {
    res.sendFile(
      path.resolve(__dirname, "../../client/dist/index.html")
    );
  });
}

/*
=================================
GLOBAL ERROR HANDLER
=================================
*/
app.use(errorHandler);

module.exports = app;