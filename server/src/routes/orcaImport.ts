import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { getDb } from "../db";
import { createProduct, createSpool, findMatchingProduct, recordSources, type Product } from "../db/repo";
import { finishFromWord } from "../lib/appearance";
import { asyncHandler, HttpError } from "../lib/http";
import { parseOrcaFilament, readUserFilamentProfiles, type OrcaImportRow } from "../lib/orca/userProfiles";

export const orcaImportRouter = Router();

function importedFiles(): Set<string> {
  const rows = getDb().prepare("SELECT file_name FROM imported_profiles").all() as { file_name: string }[];
  return new Set(rows.map((r) => r.file_name));
}

async function readRows() {
  try {
    return await readUserFilamentProfiles(config.orcaUserDir);
  } catch {
    throw new HttpError(
      404,
      `Can't read OrcaSlicer filament profiles at ${path.join(config.orcaUserDir, "filament")}. In Docker, check the /orca volume in docker-compose.yml.`,
    );
  }
}

/** Every user filament profile with a proposed identity. Read-only. */
orcaImportRouter.get(
  "/import/orca/preview",
  asyncHandler(async (_req, res) => {
    const rows = await readRows();
    const done = importedFiles();
    res.json({
      dir: path.join(config.orcaUserDir, "filament"),
      rows: rows.map((r) => ({
        ...r,
        alreadyImported: done.has(r.fileName),
        existingProduct: findMatchingProduct(r),
      })),
    });
  }),
);

const importBody = z.object({
  rows: z
    .array(
      z.object({
        fileName: z.string().min(1).max(300),
        vendor: z.string().trim().min(1).max(100),
        material: z.string().trim().min(1).max(40),
        line: z.string().trim().max(100).nullish(),
        colorName: z.string().trim().max(200).nullish(),
        createSpool: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Import the chosen profiles with the identity the user confirmed. Values
 * are re-read from disk here (not taken from the request) and recorded as
 * "orca_import" so they're never mistaken for verified data. Files that
 * map to the same product share one product and get one spool.
 */
orcaImportRouter.post(
  "/import/orca",
  asyncHandler(async (req, res) => {
    const { rows } = importBody.parse(req.body);
    const dir = path.join(config.orcaUserDir, "filament");
    const done = importedFiles();

    const parsed: { choice: z.infer<typeof importBody>["rows"][number]; profile: OrcaImportRow }[] = [];
    for (const r of rows) {
      if (path.basename(r.fileName) !== r.fileName || !r.fileName.endsWith(".json")) throw new HttpError(400, `Bad file name: ${r.fileName}`);
      if (done.has(r.fileName)) continue;
      const json = JSON.parse(await fs.readFile(path.join(dir, r.fileName), "utf8"));
      parsed.push({ choice: r, profile: parseOrcaFilament(r.fileName, json) });
    }

    const result = getDb().transaction(() => {
      const products = new Map<number, { product: Product; wantSpool: boolean; created: boolean; costPerKg: number | null; file: string }>();
      const insertProfile = getDb().prepare(
        "INSERT INTO imported_profiles (product_id, file_name, profile_name, inherits, generated_by, settings) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const { choice, profile } of parsed) {
        const identity = { vendor: choice.vendor, material: choice.material.toUpperCase(), line: choice.line || null, colorName: choice.colorName || null };
        let product = findMatchingProduct(identity);
        let created = false;
        if (!product) {
          const values = {
            ...identity,
            colorHex: profile.colorHex,
            density: profile.density,
            diameterMm: profile.diameterMm,
            spoolWeightG: profile.spoolWeightG,
            nozzleMin: profile.nozzleMin,
            nozzleMax: profile.nozzleMax,
          };
          // Finish comes from words in the name (or the line the user confirmed), so it's inferred, not imported.
          const finish = finishFromWord(identity.line) ?? profile.finish;
          product = createProduct({ ...values, finish });
          created = true;
          recordSources("product", product.id, [
            ...Object.entries(values)
              .filter(([k, v]) => v != null && k !== "vendor")
              .map(([field, value]) => ({ field, value, source: "orca_import" as const, sourceRef: profile.fileName })),
            ...(finish ? [{ field: "finish", value: finish, source: "inferred" as const, sourceRef: `from the name “${profile.profileName}”` }] : []),
          ]);
        }
        insertProfile.run(product.id, profile.fileName, profile.profileName, profile.inherits, profile.generatedBy, JSON.stringify(profile.settings));
        const entry = products.get(product.id);
        products.set(product.id, {
          product,
          wantSpool: (entry?.wantSpool ?? false) || choice.createSpool,
          created: entry?.created ?? created,
          costPerKg: entry?.costPerKg ?? profile.costPerKg,
          file: entry?.file ?? profile.fileName,
        });
      }

      let spools = 0;
      for (const { product, wantSpool, costPerKg, file } of products.values()) {
        // Only a product that has no spools yet gets one; re-importing never duplicates inventory.
        if (!wantSpool || product.spoolCount > 0) continue;
        const spool = createSpool(product.id, { price: costPerKg, notes: `Imported from OrcaSlicer profile “${file}”.` });
        if (costPerKg != null) recordSources("spool", spool.id, [{ field: "price", value: costPerKg, source: "orca_import", sourceRef: file }]);
        spools++;
      }
      return {
        files: parsed.length,
        productsCreated: [...products.values()].filter((p) => p.created).length,
        productsMatched: [...products.values()].filter((p) => !p.created).length,
        spools,
      };
    })();
    res.json(result);
  }),
);
