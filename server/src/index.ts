import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "./config";
import { HttpError } from "./lib/http";
import { apiRouter } from "./routes";

const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "2mb" }));

app.use("/api", apiRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Serve the built frontend in production (single-container deployment).
if (fs.existsSync(config.paths.clientDist)) {
  app.use(express.static(config.paths.clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(config.paths.clientDist, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Spoolkeeper server listening on port ${config.port}`);
});
