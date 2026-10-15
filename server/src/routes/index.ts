import { Router } from "express";
import { healthRouter } from "./health";

export const apiRouter = Router();

apiRouter.use(healthRouter);
