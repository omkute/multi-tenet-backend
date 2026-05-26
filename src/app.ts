import express, { type Application } from "express";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use("/api", routes);

app.use(errorHandler);

export default app;
