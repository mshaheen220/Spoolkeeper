import { Router } from "express";
import { enrichRouter } from "./enrich";
import { healthRouter } from "./health";
import { inventoryRouter } from "./inventory";
import { orcaImportRouter } from "./orcaImport";
import { tipsRouter } from "./tips";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(tipsRouter);
apiRouter.use(inventoryRouter);
apiRouter.use(enrichRouter);
apiRouter.use(orcaImportRouter);
