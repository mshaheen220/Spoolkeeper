import cors from "cors";
import { Router } from "express";
import { TIPS } from "../data/tips";

export const tipsRouter = Router();

// Open to any origin (unlike the rest of the API, which is locked to
// config.clientOrigin) so other apps on the network - Mashghal's dashboard
// in particular - can pull this list directly from their own frontends.
// Express's non-strict routing means /api/tips/ (the form Mashghal's
// tipsUrl uses) matches too.
tipsRouter.get("/tips", cors(), (_req, res) => {
  res.json({ tips: TIPS });
});
