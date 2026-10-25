import { config } from "../../config";
import { getSources, getSpool, listSpoolsForProduct } from "../../db/repo";
import { calibratedSpoolForProduct, linearAdvanceStatus, tunedForSpool } from "../calibration/service";
import { notFound } from "../http";
import { readOrcaVersion } from "./appConfig";
import { buildProfile, type BuiltProfile, type ProfileScope } from "./profile";

/** A spool's OrcaSlicer preset as it would be published or downloaded now. */
export function buildForSpool(spoolId: number, scope: ProfileScope): BuiltProfile {
  const spool = getSpool(spoolId);
  if (!spool) throw notFound("Spool");
  // Per spool: this spool's calibration. Per product: this spool's if it has
  // any, otherwise the most recently calibrated spool of the same filament.
  const own = tunedForSpool(spool.id);
  const tunedFromSpool = Object.keys(own).length || scope === "spool" ? spool.id : calibratedSpoolForProduct(spool.product.id, spool.id);
  const tuned = tunedFromSpool == null ? {} : tunedFromSpool === spool.id ? own : tunedForSpool(tunedFromSpool);
  return buildProfile({
    tuned,
    tunedFromSpool,
    linearAdvance: linearAdvanceStatus(),
    orcaVersion: readOrcaVersion(config.orcaConfPath),
    spool,
    product: spool.product,
    productSources: getSources("product", spool.product.id),
    scope,
    productSpoolPrices: listSpoolsForProduct(spool.product.id)
      .map((s) => s.price)
      .filter((p): p is number => p != null),
  });
}
