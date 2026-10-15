import { Router } from "express";
import { healthRouter } from "./health";
import { tipsRouter } from "./tips";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(tipsRouter);
