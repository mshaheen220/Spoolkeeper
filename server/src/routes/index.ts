import { Router } from "express";
import { calibrationRouter } from "./calibration";
import { enrichRouter } from "./enrich";
import { healthRouter } from "./health";
import { inventoryRouter } from "./inventory";
import { labelsRouter } from "./labels";
import { orcaImportRouter } from "./orcaImport";
import { profileRouter } from "./profile";
import { publishRouter } from "./publish";
import { settingsRouter } from "./settings";
import { tipsRouter } from "./tips";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(tipsRouter);
apiRouter.use(inventoryRouter);
apiRouter.use(enrichRouter);
apiRouter.use(orcaImportRouter);
apiRouter.use(profileRouter);
apiRouter.use(publishRouter);
apiRouter.use(settingsRouter);
apiRouter.use(calibrationRouter);
apiRouter.use(labelsRouter);
