// src/config/logger.js
const winston = require("winston");
const path    = require("path");
const fs      = require("fs");

const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const fmt = winston.format;

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: fmt.combine(
    fmt.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    fmt.errors({ stack: true }),
    fmt.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(LOG_DIR, "combined.log") }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({
    format: fmt.combine(
      fmt.colorize(),
      fmt.printf(({ level, message, timestamp, ...meta }) => {
        const extras = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
        return `${timestamp} [${level}] ${message}${extras}`;
      })
    ),
  }));
}

module.exports = logger;