# Spoolkeeper (user guide)

Spoolkeeper is where every spool of filament gets logged when it comes home, calibrated at the printer, and turned into a clean OrcaSlicer filament profile.

Open it at `http://localhost:8003` on the Mac, or at `http://<the Mac's LAN IP>:8003` from your phone at the printer. On the Mac, *System Settings → Wi-Fi → Details* shows the IP. The Mac needs to be awake.

## Tips

- The bar under the header rotates through tips on filament, drying, calibration and slicer settings. Use ‹ › to step through them, ⏸ to stop autoplay, and ✕ to collapse the bar.
- The ☀️ 🌙 💻 buttons switch between day, night and your system's theme.
- ⚙️ opens Settings.

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

## 3. A spool's page

Tap a spool in the list to see:

- **Filament details**, each with its source. Tap a badge with ↗ to check the source.
- **This spool**: purchase info.
- **OrcaSlicer profile**: see below.
- **From your old OrcaSlicer profiles**: the settings your previous profile had, kept for reference.
- **Other spools of this filament.**
- **Archive** hides the spool from the list once it's empty.

## 4. Get a profile into OrcaSlicer

On a spool's page, under **OrcaSlicer profile**:

1. Choose **This spool** (a preset named like *Sunlu PLA Wood Walnut (Spool #13)*) or **All spools of this filament** (one shared preset).
2. Open **values written** to see exactly what goes in and why.
3. Tap **Download .json**, then in OrcaSlicer use **File → Import → Import Configs…**.
   - Or download the **zip** and copy both files into `~/Library/Application Support/OrcaSlicer/user/default/filament/`, then restart OrcaSlicer.

The preset inherits the matching Creality base profile and only appears when your **TheHammer 0.4** printer is selected.

The amber **Not tuned yet** box lists what calibration will fill in: temperature, flow ratio, pressure advance, retraction and max volumetric speed. Until then OrcaSlicer uses the base profile's values for those, and nothing is guessed.

## Settings

- **Printer profile.** The OrcaSlicer printer preset that exported filament profiles attach to. It must match OrcaSlicer's name exactly; yours is `TheHammer  0.4 nozzle`, with two spaces.
- **Refresh cached data.** Fetches fresh copies of the filament databases on the next lookup.

## Coming next

- **Calibrate this spool.** A step-by-step wizard to follow at the printer, for each OrcaSlicer calibration test. It computes the result and shows the math.
- **Publish straight into OrcaSlicer.** Shows a diff, backs up first, and never overwrites a value you hand-tuned without asking.
- **Printable spool labels** with a QR code linking to the spool's page.
