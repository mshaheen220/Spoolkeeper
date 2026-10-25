# Spoolkeeper (user guide)

Spoolkeeper is where every spool of filament gets logged when it comes home, calibrated at the printer, and turned into a clean OrcaSlicer filament profile.

Open it at `http://localhost:8003` on the Mac, or at `http://<the Mac's LAN IP>:8003` from your phone at the printer. On the Mac, *System Settings → Wi-Fi → Details* shows the IP. The Mac needs to be awake.

## Tips

- The bar under the header rotates through tips on filament, drying, calibration and slicer settings. Use ‹ › to step through them, ⏸ to stop autoplay, and ✕ to collapse the bar.
- The ☀️ 🌙 💻 buttons switch between day, night and your system's theme.
- ⚙️ opens Settings.

## The spool list

The home page lists every spool with its **color**, **brand**, **material**, **finish** and **Spool #**. On a phone, finish and # sit under the color name.

- **Sort** by tapping any column header; tap again to reverse.
- **Filters** narrows the list. Combine any of:
  - **Material:** PLA, PETG, TPU…
  - **Finish:** Silk, Matte, Translucent, Glitter…
  - **Color family:** reds, greens, browns… Worked out from the color name first ("Walnut" is brown, "Rose" is pink), and from the swatch when the name doesn't say. A multi-color filament shows under each of its colors.
  - **Brand.**
- **Search** matches brand, color, store and Spool #.
- Filters and sort are kept in the page address, so the back button and refresh keep them, and you can bookmark a view such as "PLA greens".
- **Diameter** only appears for a spool that isn't 1.75 mm.
- **Spool #** is the permanent number of that physical roll. It's in profile names like "(Spool #27)", it's what calibration results belong to, and it'll go on spool labels. The numbers just count up as spools are added.

## 1. Bring in what you already have (once)

**Spools → Import** reads your OrcaSlicer user filament profiles and turns them into inventory.

- **Check each card.** The brand, type, line and color become that filament's name in Spoolkeeper, for example *Sunlu PLA Wood Walnut*. Fix anything that's off.
- **Untick profiles you don't want**, such as generic copies.
- **Duplicates merge.** Two profiles for the same filament, like *Comgrow - Red* and *COMGROW PLA Red*, become one filament.
- **"I have a spool of this"** also creates a spool, so you get a Spool #ID right away.
- **Warnings** mark values you shouldn't trust. One example: flow 0.94 is a template default left by the old sync tool, not a calibrated value.

Nothing in OrcaSlicer is changed. Imported values are badged **Orca**. Treat them as starting points, not tuned settings.

## 2. Add a new spool

On **Spools → ＋ Add spool**:

1. **Scan barcode** opens a live camera view. This works on this computer at `http://localhost:8003`, or at any `https://` address.
   - **There's no button to press.** While the green dot says *Looking for a barcode*, it checks the picture several times a second and stops as soon as it reads one. Sideways barcodes are fine.
   - **Which barcode:** use the one with 12-13 digits under it. It's usually on the box or bag. The label on the spool often has only a batch code or QR code. A QR code that links to a web page fills in the **product page** (then tap *Read page*). Anything else gets a note saying what it read.
   - **If nothing happens after a few seconds,** tips appear:
     - Laptop cameras can't focus close up, so move the barcode back until it's sharp.
     - Hold it flat and out of glare.
   - **Use a photo instead** reads a photo you choose. A photo taken on your phone is much sharper than a webcam.
   - On a phone over the plain `http://` network address, browsers don't allow a live camera. The button reads **Photo of barcode** there, and you take a photo.
   - You can always type the number and press **Enter** or **Find**.

   If the Open Filament Database knows the barcode, brand, type, line, color and size fill in automatically.
2. If there's no barcode, pick **brand**, a **material** shortcut (PLA, Silk PLA, Wood PLA, PETG, …) and the **color name**.
   - **Empty spool** weight fills in from your other spools of that brand. It uses the same material first, because brands often use a different spool for PETG than for PLA, and falls back to the brand alone. The note under the field says what it's based on, for example *From 3 of your 4 Sunlu PLA filaments (also seen: 163 g)*, and it's badged **Inferred**. It only fills a blank field. Type your own weight and it stays.
3. Optionally paste the **product page URL** and tap **Read page**.
   - **What it suggests:** brand, type and color name come from the store's product data, along with the specs below.
   - **Brand:** a brand you already have keeps your spelling (Overture's store says "Overture 3D"; you get *Overture*).
   - **Color:** it's read from the color picked in the link. On most stores, choosing your color on the page adds `?variant=…` to the address, so copy the link *after* picking the color. If the link doesn't say which color, Read page tells you instead of guessing.
   - **Filling them in:** tap a suggestion to use it, or tap **Fill empty fields** to fill a blank brand and color at once.

   If the page links a **technical datasheet (TDS) PDF**, Spoolkeeper reads that too; it skips safety sheets, RoHS/REACH and certificates. You can also paste a datasheet PDF link directly. **If a store blocks Spoolkeeper** (many do, Amazon especially), or the specs only appear once the page has loaded in a browser, use **"Paste the page's text"** under the URL box. On the product page, select all (⌘A), copy (⌘C), paste, and tap *Read pasted text*. It reads what you can see, the same way. Read page also tells you when the page itself was blocked, rather than quietly returning less. Datasheets often hold what the page doesn't: Shore hardness, density, drying temperature, and retraction, speed-tier and plate advice. That advice is kept in **Maker's print notes** for reference when calibrating. Spoolkeeper looks for printing and bed temperatures, speed and drying advice, and quotes the text it found each value in. Many stores (Amazon especially) block this; you'll see a message saying so.
4. Tap **🔎 Look up filament data**. The **Suggestions** card shows:
   - **Matched records**: which entry each source matched. Change it if it picked the wrong color, or choose "Don't use".
   - **Values**: every value each source suggests, with a badge for where it came from. Tap one to use it.
   - **Sources disagree** means sources gave different numbers. Pick one, or type what's on the box.
   - **Fill N empty fields where sources agree** fills only blank fields where every source gave the same value.
5. Fill in **This purchase**: number of spools, price per spool, store and date. Each spool gets its own Spool #ID.
6. Tap **Save**.

If you already have this filament, a banner offers **Add another spool of this**. That reuses its details, so you only log the purchase.

Under each field, a short note explains why the value matters. Badges show where every value came from: **You**, **OFD** (Open Filament Database), **SpoolmanDB**, **spoolz**, **Page**, **Orca**, **Inferred** (from your own spools) or **Default**.

## 3. Colors, finish and flexibility

**Type, Line and Finish** sit together under *What is it?*, because Line and Finish are easy to mix up. **Line** is the maker's range name (PLA+, High Speed); **Finish** is how it looks (Basic, Silk, Matte). Colors and Shore hardness are in the **Color & flexibility** section below. Both appear when you add a spool and when you edit a filament.

- **Single or Multi-color.** For dual-color, tri-color or rainbow filament, switch to **Multi-color** and list 2–6 colors.
  - **How the colors change.** *Side by side (coaxial)* means the colors run together down the strand, as in dual- and tri-color silk; every layer shows all of them. *Along the length* means the color shifts as the spool unwinds, as in gradient or rainbow filament.
  - **★ Main color.** OrcaSlicer can only show one color per filament. Spoolkeeper sends it the starred color: the first one unless you star another. The center of the swatch shows which one it is.
- **Finish.** Pick **every** look that applies. A filament can be Translucent *and* Glitter, and it then shows under both filters. Options: Basic (plain, as in "PLA Basic"; it can't be combined with the others), Silk, Matte, Marble, Glitter, Glow in the Dark, Translucent, Wood Fill, and so on. **Line** is for the maker's product range (PLA+, High Speed, Tough…); if you type a finish word like Basic or Silk there, Spoolkeeper offers to move it to Finish. Picking *Silk PLA*, *Matte PLA* or *Wood PLA* sets it for you. Filaments you imported got their finish from words in their names; those show an **Inferred** badge until you confirm or change them.
- **Shore hardness.** Shown automatically for TPU and other flexibles, or tap *Flexible filament? Add Shore hardness*. Enter the number and scale, for example 95 A.

Lookups also suggest these values when the databases know them. **Read page** picks up finishes from the product description ("twinkling" or "sparkle" means Glitter, "translucent", "silk"…) and whether the color shifts along the length ("gradient", "rainbow", "color changing") or runs side by side ("dual color", "co-extruded"). It also reads nozzle and bed ranges and the empty reel weight. Product pages almost never list the actual colors, so when a direction is set, the color editor asks you to add them, and Save waits until you have.

## 4. Edit a filament

On any spool's page, tap **✎ Edit filament**. This is the way to fill in what an import couldn't know, such as colors, finish or Shore hardness, or to fix a name.

- **Look up filament data** works here too, for filling in older filaments.
- Changes apply to every spool of that filament. The Save button counts how many fields you changed.

## 5. A spool's page

Tap a spool in the list to see:

- **Filament details**, each with its source. Tap a badge with ↗ to check the source.
- **This spool**: purchase info.
- **OrcaSlicer profile**: see below.
- **From your old OrcaSlicer profiles**: the settings your previous profile had, kept for reference.
- **Other spools of this filament.**
- **Archive** hides the spool from the list once it's empty.

## 6. Calibrate a spool

On a spool's page, tap **📐 Calibrate this spool**. The wizard follows OrcaSlicer's recommended order, and each step builds on the one before:

1. **Temperature.** Menu bar → Calibration › Temperature, with the filament type and start/end temperatures shown. The tower starts hottest at the bottom and gets 5 °C cooler every block. Enter the temperature printed on the best block.
2. **Max volumetric speed.** Calibration › Max flowrate. Measure the height where the walls first turn rough or change sheen. Spoolkeeper works out start + height × step, then takes off a safety margin (15% unless you change it).
3. **Pressure advance.** Skipped, because your Marlin firmware has no Linear Advance (`M900` → Unknown command). Exported profiles keep it switched off. If you ever flash firmware that has it, change this in Settings and the step comes back.
4. **Flow ratio.** Two ways to do it:
   - **Pass 1 + Pass 2:** pick the smoothest block's modifier in Pass 1 (−20 … +20). Put the result into OrcaSlicer's filament flow ratio before printing Pass 2 (−9 … 0); the wizard reminds you.
   - **YOLO:** OrcaSlicer's single-print method.
5. **Retraction.** Calibration › Retraction (0 → 2 mm in 0.1 mm steps). Measure the height where stringing stops, or type the length from the G-code's `Calib_Retraction_tower` comment. Speed, z-hop type and wipe come prefilled from your printer profile (Slope Lift, 0.8 mm wipe); change them if this filament needs something different.
6. **Cooling, bed and first layer** (optional). Fan speeds and bed temperatures for smooth and textured PEI that worked on real prints. The bed temperatures come **prefilled**: this spool's saved values, else the maker's range (smooth PEI at the middle, textured 5 °C warmer), else the base profile's default. Each field says where its number came from. The wizard also says which side your OrcaSlicer projects on this printer use (it reads OrcaSlicer's plate setting: Smooth High Temp Plate means smooth PEI, Textured PEI Plate means textured). Adjust them to what actually stuck, or save them as they are.

Each step shows **the math** as you type. It warns you when a result looks odd: outside the maker's range, far from your known-good Sunlu Walnut Wood (210 °C, 1.2 mm), or a flow ratio far from 1.0, which usually means the extruder needs checking.

**Save result** stores the run with its date, what you saw, the computed value and your notes. Redo a step any time; the newest result is the one used. **History** lets you switch an older run back on (*Use again*) or switch one off (*Don't use*). Nothing is ever deleted.

On the spool's page, **Tuned settings** compares each value with the maker's range, the base profile's default, and other spools of the same filament.

**Before your first calibration**, check **Settings → Printer**:

- **Linear Advance** is set to *Not available* (your `M900` test).
- **E-steps check** (optional): mark the filament 120 mm above the extruder, extrude 100 mm, enter what's left, and Spoolkeeper tells you whether 93 is right.

## 7. Print spool labels

Tap **🏷 Print label** on a spool's page, or **🏷 Print N labels** above the list to print every spool the list is currently showing. Filter first, for example to just the new ones.

Each label (60 × 20 mm by default, to fit the label holders) has:

- **A QR code** that opens that spool's page in Spoolkeeper on your phone.
- **The color name** in bold.
- **Brand · material · finish.**
- **Nozzle (N) and bed (B) temperatures.** A **✓** means the value came from calibrating that spool; otherwise it's the maker's range.
- **The Spool #.**
- **A color stripe** on the right edge (optional; it shows the gradient for multi-color filament).

Choose **Label printer** (one label per page at exactly the label size) or **Letter/A4 paper** (labels tiled with cut lines). In the print dialog, set the scale to **100%** and turn off headers and footers.

**Settings → Spool labels** sets the size and the address the QR codes open. The default is `http://Michaels-MacBook-Pro.local:8003`, the Mac's network name, which keeps working when its IP address changes. Reprint a label after calibrating so it shows the ✓ values.

## 8. Get profiles into OrcaSlicer

Spoolkeeper writes its presets straight into OrcaSlicer's filament folder. Nothing happens on its own: you publish when you've added a spool or calibrated one.

**All spools at once.** Tap **⇡ Publish** on the spool list.

1. Choose **One per spool** or **One per filament** (spools of the same filament share a preset). Presets are named like the rest of OrcaSlicer's list, brand - color: *Sunlu - Walnut*. Something extra is added only to keep two apart: *Sunlu - Black PETG* next to the PLA *Sunlu - Black*, *Make Market - Glitter White* next to *Marble White*, and *(Spool #13)* when you publish one per spool and have several spools of that filament.
2. Each preset shows where it stands: **Not in OrcaSlicer**, **Changes**, **Up to date** or **Blocked**. Open **Show changes** to see each value, old → new.
3. New and changed presets come ticked. Tap **Publish N presets**.
4. **Quit and reopen OrcaSlicer.** It only reads presets when it starts.

**One spool.** On its page, under **OrcaSlicer profile → In OrcaSlicer**, tap **Add to OrcaSlicer** or **Update in OrcaSlicer**.

What keeps your settings safe:

- **Values you change in OrcaSlicer are kept.** Spoolkeeper remembers what it wrote. If a value in OrcaSlicer is different now, it's flagged *Changed in OrcaSlicer* and left alone unless you tick it to overwrite. Settings Spoolkeeper doesn't manage, like retraction you set in OrcaSlicer, are never touched.
- **It only touches its own presets.** If OrcaSlicer already has a preset with the same name that Spoolkeeper didn't make, that one is **Blocked** instead of overwritten.
- **Backups.** Every preset that's replaced is copied to `data/backups/publish-<date>/` first.
- Renaming a filament in Spoolkeeper renames its preset instead of leaving a duplicate.
- **Same name as an old preset.** If spoolman2slicer made it, Spoolkeeper's preset takes its place (backed up first). If you made or saved it yourself, it's **Blocked** because it may hold your tuning. Tick **Replace it** to swap it out (backed up first), or rename yours in OrcaSlicer to keep both.

**Old spoolman2slicer presets.** At the bottom of the Publish page is a list of the presets spoolman2slicer generated (*Sunlu - Black*, …). Once a filament's Spoolkeeper preset is published, its old one shows **replaced ✓** and comes ticked. **Back up and remove** copies them to `data/backups/spoolman2slicer-<date>/`, then deletes them. Presets you made or saved yourself in OrcaSlicer aren't on this list, so remove those in OrcaSlicer if you no longer want them.

**Download instead.** Under **Download instead** on a spool's page you can still get the `.json` and import it with OrcaSlicer's **File → Import → Import Configs…**.

The preset inherits the matching Creality base profile and **shows up for every printer**: filament is shelf stock, so it's available whether you pick TheHammer 0.4, the 0.2 preset or a future second printer. The notes say which printer and nozzle the tuned values were measured on. That matters most for max volumetric speed, which is much lower on a 0.2 mm nozzle; recalibrate on the 0.2 if you print this filament there often. Its color is the filament's color, or the ★ main color for a multi-color filament. All the colors, the finish and the Shore hardness are written into the preset's notes.

Calibrated values are badged **Tuned** and override the base profile. Until a value is tuned, the amber **Not tuned yet** box lists it and OrcaSlicer uses the base profile's value; nothing is guessed. A per-filament profile uses the spool you're on if it's calibrated, otherwise the most recently calibrated spool of that filament, and says which.

## Settings

- **Printer you calibrate on.** Pick it from your OrcaSlicer printer presets (*TheHammer 0.4 nozzle* or *TheHammer 0.2 nozzle*). Every calibration result records it, along with the nozzle size, and profiles mention it in their notes. It doesn't limit where profiles show up; they show for every printer. Changing it saves immediately.
- **Refresh cached data.** Fetches fresh copies of the filament databases on the next lookup.

