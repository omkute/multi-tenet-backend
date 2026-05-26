import express, { type Application } from "express";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import { getHealth } from "./controllers/health.controller.js";
import { metricsHandler } from "./controllers/metrics.controller.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import { metricsMiddleware } from "./lib/metrics.js";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);
app.use(metricsMiddleware);

app.get("/health", getHealth);
app.get("/metrics", metricsHandler);

app.use("/api", routes);

app.use(errorHandler);

export default app;
