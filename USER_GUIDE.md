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

1. **Scan barcode** opens your phone camera. Photograph the barcode on the box or spool label. If the Open Filament Database knows it, brand, type, line, color and size fill in automatically. You can also type the number in.
2. If there's no barcode, pick **brand**, a **material** shortcut (PLA, Silk PLA, Wood PLA, PETG, …) and the **color name**.
3. Optionally paste the **product page URL** and tap **Read page**. Spoolkeeper looks for printing and bed temperatures, speed and drying advice, and quotes the text it found each value in. Many stores (Amazon especially) block this; you'll see a message saying so.
4. Tap **🔎 Look up filament data**. The **Suggestions** card shows:
   - **Matched records**: which entry each source matched. Change it if it picked the wrong color, or choose "Don't use".
   - **Values**: every value each source suggests, with a badge for where it came from. Tap one to use it.
   - **Sources disagree** means sources gave different numbers. Pick one, or type what's on the box.
   - **Fill N empty fields where sources agree** fills only blank fields where every source gave the same value.
5. Fill in **This purchase**: number of spools, price per spool, store and date. Each spool gets its own Spool #ID.
6. Tap **Save**.

If you already have this filament, a banner offers **Add another spool of this**. That reuses its details, so you only log the purchase.

Under each field, a short note explains why the value matters. Badges show where every value came from: **You**, **OFD** (Open Filament Database), **SpoolmanDB**, **spoolz**, **Page**, **Orca** or **Default**.

## 3. Colors, finish and flexibility

Every filament has a **Look** section, both when you add a spool and when you edit a filament.

- **Single or Multi-color.** For dual-color, tri-color or rainbow filament, switch to **Multi-color** and list 2–6 colors.
  - **How the colors change.** *Side by side (coaxial)* means the colors run together down the strand, as in dual- and tri-color silk; every layer shows all of them. *Along the length* means the color shifts as the spool unwinds, as in gradient or rainbow filament.
  - **★ Main color.** OrcaSlicer can only show one color per filament. Spoolkeeper sends it the starred color: the first one unless you star another. The center of the swatch shows which one it is.
- **Finish.** Basic (plain, as in "PLA Basic"), Silk, Matte, Marble, Glitter, Glow in the Dark, Translucent, Wood Fill, and so on. **Line** is for the maker's product range (PLA+, High Speed, Tough…); if you type a finish word like Basic or Silk there, Spoolkeeper offers to move it to Finish. Picking *Silk PLA*, *Matte PLA* or *Wood PLA* sets it for you. Filaments you imported got their finish from words in their names; those show an **Inferred** badge until you confirm or change them.
- **Shore hardness.** Shown automatically for TPU and other flexibles, or tap *Flexible filament? Add Shore hardness*. Enter the number and scale, for example 95 A.

Lookups also suggest these values when the databases know them.

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

## 7. Get a profile into OrcaSlicer

On a spool's page, under **OrcaSlicer profile**:

1. Choose **This spool** (a preset named like *Sunlu PLA Wood Walnut (Spool #13)*) or **All spools of this filament** (one shared preset).
2. Open **values written** to see exactly what goes in and why.
3. Tap **Download .json**, then in OrcaSlicer use **File → Import → Import Configs…**.
   - Or download the **zip** and copy both files into `~/Library/Application Support/OrcaSlicer/user/default/filament/`, then restart OrcaSlicer.

The preset inherits the matching Creality base profile and **shows up for every printer**: filament is shelf stock, so it's available whether you pick TheHammer 0.4, the 0.2 preset or a future second printer. The notes say which printer and nozzle the tuned values were measured on. That matters most for max volumetric speed, which is much lower on a 0.2 mm nozzle; recalibrate on the 0.2 if you print this filament there often. Its color is the filament's color, or the ★ main color for a multi-color filament. All the colors, the finish and the Shore hardness are written into the preset's notes.

Calibrated values are badged **Tuned** and override the base profile. Until a value is tuned, the amber **Not tuned yet** box lists it and OrcaSlicer uses the base profile's value; nothing is guessed. A per-filament profile uses the spool you're on if it's calibrated, otherwise the most recently calibrated spool of that filament, and says which.

## Settings

- **Printer you calibrate on.** Pick it from your OrcaSlicer printer presets (*TheHammer 0.4 nozzle* or *TheHammer 0.2 nozzle*). Every calibration result records it, along with the nozzle size, and profiles mention it in their notes. It doesn't limit where profiles show up; they show for every printer. Changing it saves immediately.
- **Refresh cached data.** Fetches fresh copies of the filament databases on the next lookup.

## Coming next

- **Publish straight into OrcaSlicer.** Shows a diff, backs up first, and never overwrites a value you hand-tuned without asking.
- **Printable spool labels** with a QR code linking to the spool's page.
