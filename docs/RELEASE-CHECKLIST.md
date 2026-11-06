# Release Verification & Smoke Test Checklist (v6.0.1)

This checklist provides a manual **15-minute smoke test** for the shop owner or release manager on a real Windows machine (or staging server) before deployment. All steps use the actual production scripts and paths.

All UI text matches the Persian production strings verbatim.

---

## 1. Prerequisites & Environment Check

- [ ] **Operating System:** Windows 10/11 (or Windows Server).
- [ ] **Node.js:** `>= 18.0.0` installed (`node -v`).
- [ ] **Local Network:** Machine connected to the shop LAN / Wi-Fi router.
- [ ] **Clean Data State (First-Run):** If testing clean-install, ensure `data/auth.json` is not present (or backed up).
- [ ] **Dependencies:** Run `npm ci --omit=dev` (or verify `node_modules` exists).

---

## 2. 15-Minute Manual Smoke Test

### Step 1: Boot via `Start.bat`
- **Action:** Double-click `Start.bat` in the repository root.
- **Expected Result:**
  - A Windows console opens.
  - The supervisor (`scripts/supervisor.js`) starts and launches `server.js`.
  - Console prints:
    - Server version `MovieCatalog Server v6.0.1`
    - Auth status `Auth setup: first-run (setup required)`
    - Background scan and watcher initialization
    - URL banner listing the Local URL (`http://localhost:3000`) and Network LAN URL (`http://192.168.x.x:3000`).

### Step 2: First-Run Admin Setup (Loopback Only)
- **Action:** On the server machine, open a browser to `http://localhost:3000`.
- **Expected Result:**
  - The modal dialog **«راه‌اندازی اولیه»** appears automatically.
  - Enter an admin password (at least 8 characters) in **«رمز عبور مدیر»** and confirm.
  - Click **«ذخیره و ورود»**.
  - Setup succeeds, session is established, and the header displays the manager indicator.
  - `data/auth.json` is created on disk.

### Step 3: Populate `Library/` with Real Posters
- **Action:** Copy sample poster files into `Library/`:
  - `Library/Movies/Action/0001- Heat 1995.jpg`
  - `Library/Animation/0002- Spirited Away 2001.jpg`
  - `Library/Series/Breaking Bad.jpg`
  - `Library/Games/PS4/God of War.jpg`
- **Expected Result:**
  - Filesystem watcher detects files within 500 ms debounce.
  - Grid refreshes without reloading the page.
  - Posters display with correct title, year, and type badges:
    - Heat: «زیرنویس فارسی» (or genre tag)
    - Spirited Away: «انیمیشن دوبله»
    - Breaking Bad: «سریال»

### Step 4: Customer Flow on Mobile Phone
- **Action:** On a mobile phone connected to the same Wi-Fi, open the Network URL printed in the console (e.g. `http://192.168.1.50:3000`).
- **Expected Result:**
  - Page loads quickly with bundled Vazirmatn font in RTL layout.
  - No manager controls are visible (no edit/add buttons).
  - Tap card 0001 (Heat). The card highlights and selection sidebar counter updates: **«انتخاب‌شده‌ها (۱)»**.
  - Scroll performance is fluid with zero lag.

### Step 5: Real-Time Manager Observation & Order Creation
- **Action:** Look at the server screen while the customer taps on the phone.
- **Expected Result:**
  - The manager's **«پنل مدیریت»** / **«انتخاب‌شده‌ها»** updates in real time over WebSocket without delay.
  - Click **«ثبت سفارش»**.
  - An order number is generated (e.g. `order-0001`).
  - The selection clears on both the phone and manager screen with notification.

### Step 6: Add Movie with Poster Upload
- **Action:** In the manager interface, click **«افزودن فیلم»**.
- **Expected Result:**
  - The Add Modal opens with focus trapped inside.
  - Enter:
    - ID: Next free ID auto-populates (or enter `0003`)
    - Title: `Inception`
    - Year: `2010`
    - Genres: Select `اکشن` and `علمی تخیلی`
    - Poster: Upload a valid JPEG/PNG poster image.
  - Click **«افزودن»**.
  - Success message appears. The poster is saved into `Library/Movies/اکشن/0003- Inception 2010.jpg` and `Library/Movies/علمی تخیلی/0003- Inception 2010.jpg`.

### Step 7: Edit Movie Metadata (Rating & Plot)
- **Action:** Click **«ویرایش»** on card `0003` (Inception).
- **Expected Result:**
  - Enter IMDb rating `8.8` and a Persian plot summary in **«خلاصه داستان»**.
  - Click **«ذخیره تغییرات»**.
  - The modal closes, card updates with star rating badge `8.8`.
  - Data is saved in `data/metadata.json`.

### Step 8: Game Mode & Game Creation
- **Action:** In the top header, switch the media toggle to **«بازی‌ها»**.
- **Expected Result:**
  - Accent theme shifts to purple gaming styling.
  - Grid shows games catalog (`God of War` with `PS4` badge).
  - Click **«افزودن بازی»**.
  - Enter title `Spider-Man`, select platforms `PS4` and `PS5`, upload poster, click **«افزودن»**.
  - Both `Library/Games/PS4/Spider-Man.jpg` and `Library/Games/PS5/Spider-Man.jpg` are created.

### Step 9: Soft Delete & Trash Restoration
- **Action:** Switch back to **«فیلم و سریال»**. Click **«ویرایش»** on Inception, then click **«حذف فیلم»**. Confirm deletion.
- **Expected Result:**
  - Posters move to `Library/.trash/`.
  - Open **«سطل زباله»** from the admin panel.
  - Inception is listed with its deletion timestamp.
  - Click **«بازیابی»**.
  - The file is restored back to its genre folders and reappears in the grid with intact metadata.

### Step 10: Orders Panel, Print & CSV Export
- **Action:** Open **«سفارش‌ها»** panel.
- **Expected Result:**
  - Click **«چاپ»** on the order created in Step 5. A clean, styled RTL print preview opens with barcodes/IDs.
  - Click **«خروجی اکسل»** (CSV export).
  - The downloaded `.csv` file opens cleanly in Microsoft Excel / LibreOffice with UTF-8 BOM encoding.
  - Verify formula injection safety: cells do not execute unexpected macros.

### Step 11: Restart Persistence Test
- **Action:** Press `Ctrl+C` in the console to stop the server, then restart with `Start.bat`.
- **Expected Result:**
  - Server boots from `data/catalog.json` cache immediately.
  - Open browser: Inception rating `8.8` and plot summary remain intact (persisted in `data/metadata.json`).
  - Orders list remains intact (persisted in `data/orders.json`).

### Step 12: Hard Kill Resilience Test
- **Action:** While the server is running, terminate the `node.exe` process via Windows Task Manager (End Process).
- **Expected Result:**
  - The supervisor (`scripts/supervisor.js`) detects the crash and cleanly restarts the child process.
  - Re-opening the browser shows zero data corruption. `data/*.json` files are uncorrupted due to atomic swap writes.

### Step 13: Windows Firewall & Mobile Access Check
- **Action:** Verify whether the phone on LAN can reach the server without timeout.
- **Expected Result:**
  - If blocked, ensure Windows Defender Firewall allows inbound TCP traffic on port 3000 for Private Networks:
    ```powershell
    netsh advfirewall firewall add rule name="MovieCatalog" dir=in action=allow protocol=TCP localport=3000
    ```

### Step 14: Graceful Shutdown via `Stop.bat`
- **Action:** Double-click `Stop.bat` in the repository root.
- **Expected Result:**
  - `Stop.bat` writes `logs/stop.request`.
  - The running server detects the file within 1 second, logs shutdown message, closes WebSockets, and exits with code 0.
  - The supervisor sees clean exit code 0 and terminates without restarting.

### Step 15: Start with Library Folder Missing
- **Action:** Temporarily rename or move the `Library/` directory, then start the server (`node server.js` or `Start.bat`).
- **Expected Result:**
  - The server boots cleanly without throwing an unhandled `TypeError` or crashing.
  - Console prints a readable message: `library root unreadable before swap` (or recreates the directory).
  - API endpoints `/api/auth/status` and `/api/config` respond with HTTP 200 without log errors.
  - Restore `Library/` folder after test.

### Step 16: Start with Damaged `data/auth.json` (Quarantine & First-Run Setup)
- **Action:** Write invalid JSON content into `data/auth.json` (e.g. `corrupted{bad json`), then restart the server.
- **Expected Result:**
  - The server detects the corruption, quarantines the damaged file to `data/auth.json.corrupted-<timestamp>`, and logs the quarantine action.
  - Server reverts to first-run setup mode (`Auth setup: first-run (setup required)`).
  - Navigating to `http://localhost:3000` presents the first-run admin setup modal **«راه‌اندازی اولیه»** again.
  - Setting a new password creates a valid `data/auth.json`.

### Step 17: Rating & Plot Summary Surviving Restart (Movie, Series, Animation)
- **Action:**
  1. Add/edit metadata for a **Movie** (e.g. Inception ID `0003`: rating `8.8`, Persian plot summary).
  2. Add/edit metadata for an **Animation** (e.g. Spirited Away ID `0002`: rating `8.6`, Persian plot summary).
  3. Add/edit metadata for a **Series** (e.g. Breaking Bad: rating `9.5`, Persian plot summary).
  4. Stop the server (`Stop.bat`) and restart with `Start.bat`.
- **Expected Result:**
  - All three media types retain their respective ratings and Persian plot summaries from `data/metadata.json`.
  - In the UI, the Movie card shows rating `8.8` and plot; Animation card shows rating `8.6` and plot; Series card shows rating `9.5` and plot.
  - Neither background library scan nor watcher alters or wipes the metadata for any type.

---

## 3. Release Steps (Tagging & Deployment)

Once all 17 smoke test steps pass:

1. **Backup Data Directory:**
   ```powershell
   Copy-Item -Recurse -Force data data_release_backup
   ```
2. **Git Release Tag:**
   ```bash
   git checkout master
   git merge --ff-only release/prep
   git tag -a v6.0.1 -m "6.0.1"
   ```
3. **Distribution Archive:**
   - Create clean ZIP distribution excluding `node_modules`, `data`, `logs`, and `Library`.
   - On the customer machine, run `install.bat` then `Start.bat`.
