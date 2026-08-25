# QLS — Quick Links & Status

A fast, polished homelab homepage. Manage tiles, icons, backgrounds, and status checks entirely through the UI — no code editing required.

---

## Features

- ⚡ **Static-first, extremely fast** — plain HTML/CSS/JS, no framework
- 🎨 **Polished dark theme** — responsive grid, looks great on desktop and mobile
- ➕ **Add / Edit / Delete tiles** — modal dialog, no code needed
- ↕️ **Drag-and-drop** or **↑↓ buttons** to reorder tiles
- 🗂️ **Category grouping** — tiles can be organised into labelled sections
- 🟢 **Reachability status** — pings each tile URL directly; no backend needed
- 🐳 **Optional Docker API** — lightweight Python/Flask API for container states
- 🖼️ **Custom background** — upload any image via Settings
- 🔲 **Tile transparency** — adjustable opacity slider so the background shows through
- 🔗 **New-tab control** — global default plus per-tile override
- 👁️ **Tile visibility** — toggle icon, title, description, status dot per tile
- 🎨 **Simple Icons** — search and use icons from [cdn.simpleicons.org](https://cdn.simpleicons.org) when creating tiles
- 📁 **Icon upload** — upload custom PNG/SVG/JPG icons, stored in browser
- 💾 **Local persistence** — saved to `localStorage`; export/import as JSON
- ⌨️ **Keyboard shortcut** — `Ctrl/Cmd + K` to quickly add a tile

---

## Quick Start

### Requirements

- Any modern web browser
- One of: Docker (recommended), Python 3, or Node.js

### Option A — Docker Compose (recommended for NUC)

This runs the static dashboard on **port 5555** and the optional Docker status API:

```bash
# 1. Clone the repository
git clone https://github.com/Mr-Vale/QLS.git
cd QLS

# 2. Start everything
docker compose up -d

# 3. Open in your browser
# http://<nuc-ip>:5555
```

The dashboard is at **`http://<nuc-ip>:5555`**.
The optional container status API is at `http://<nuc-ip>:5000/api/status`.

#### Changing the port

Edit `docker-compose.yml` before running `docker compose up`:

```yaml
services:
  frontend:
    ports:
      - "8080:80"   # change 8080 to any port you like
```

Then restart:

```bash
docker compose down
docker compose up -d
```

### Option B — Python (no Docker)

```bash
git clone https://github.com/Mr-Vale/QLS.git
cd QLS
python3 -m http.server 5555
# Open http://localhost:5555
```

To use a different port, replace `5555` with your preferred port number.

### Option C — Node.js

```bash
git clone https://github.com/Mr-Vale/QLS.git
cd QLS
npx serve -l 5555 .
# Open http://localhost:5555
```

### Option D — Nginx / Caddy

Point the document root at the `QLS/` directory and set the listening port to **5555** (or any port). The `nginx.conf` in this repo is pre-configured for use with Docker Compose.

---

## Adding and Managing Tiles

### Add a tile

1. Click **＋** in the top-right corner, or press **Ctrl / Cmd + K**.
2. Fill in the form:
   - **Label** — display name shown on the tile
   - **URL** — the address the tile links to (e.g. `http://192.168.1.10:9000`)
   - **Category** — optional group header (e.g. *Monitoring*, *Media*)
   - **Description** — short subtitle shown under the label
   - **Icon** — choose from three tabs:
     - *Emoji / URL* — type an emoji (`🐳`) or paste an image URL
     - *Simple Icons* — search by service name; icons are fetched from [cdn.simpleicons.org](https://cdn.simpleicons.org)
     - *Upload* — upload a PNG, SVG, JPG, or GIF; stored in your browser
3. Set **Tile display options** (see below).
4. Click **Save Tile**.

### Tile display options

Each tile has individual toggles:

| Toggle | Default | Effect |
|---|---|---|
| Show icon | ✅ | Display the icon image or emoji |
| Show title | ✅ | Display the tile label |
| Show description | ✅ | Display the description text |
| Show status dot | ✅ | Show the reachability/status indicator |
| Override: open in new tab | ☐ | Overrides the global new-tab setting for this tile only |

### Edit or delete tiles

1. Click **✏️** (Edit mode) in the header.
2. Hover any tile — action buttons appear:
   - ✏ **Edit** — reopen the editor dialog
   - ↑ / ↓ — reorder within the list
   - ✕ — delete with confirmation
3. Drag and drop tiles to rearrange them.
4. Click **✏️** again to exit edit mode (buttons disappear).

---

## Status Indicators

### Reachability (built-in, no backend)

QLS can ping each tile's URL directly from the browser:

1. Open **Settings** (⚙️).
2. Under **Reachability Status**, enable the toggle.
3. Set the **Poll interval** (seconds).

Each tile gets a coloured dot:

| Colour | Meaning |
|---|---|
| 🟢 Green | Host responded — service is up |
| 🔴 Red | Network error — host is unreachable |
| ⚪ Grey | Unknown / status disabled |
| 🟡 Yellow (pulse) | Currently checking |

> **Note:** The browser uses `no-cors` mode for cross-origin requests, so the status dot shows whether the host is network-reachable, not the HTTP status code. Services that return 404 but are still up may show as green. This is the expected behaviour for a lightweight homelab check.

### Docker container status (optional backend)

For per-container up/down from Docker's API, run the included Python/Flask sidecar:

```bash
docker compose up -d   # starts both frontend + status-api
```

Then in **Settings → Container Status API**:

- Enable the toggle
- Set **API URL** to `/api/status`
- Set each tile's **Container name** to the Docker container name

#### Status API environment variables

| Variable     | Default | Description |
|---|---|---|
| `PORT`       | `5000`  | Port for the Flask API |
| `CONTAINERS` | *(all)* | Comma-separated container names to watch; empty = all |

---

## Settings

Open via the **⚙️** button in the header.

### Appearance

| Setting | Description |
|---|---|
| Site title | Header logo text |
| Subtitle | Header subtitle text |
| Background image | Upload a PNG/JPG/etc. — stored in browser; displays behind the tile grid |
| Tile transparency | Slider 10 %–100 %; lower = more transparent tiles, more background visible |

### Links

| Setting | Description |
|---|---|
| Open in new tab | Global default — checked = all tiles open in a new tab; unchecked = same tab |

Per-tile override: enable **Override: open in new tab** in the tile editor to set a different behaviour for an individual tile.

### Reachability Status

| Setting | Description |
|---|---|
| Enable reachability | Toggle polling of each tile's URL |
| Poll interval (s) | How often to re-check (default 30 s) |

### Container Status API (optional)

| Setting | Description |
|---|---|
| Enable API status | Poll the Docker status endpoint |
| API URL | Endpoint (default `/api/status`) |
| Poll interval (s) | Refresh frequency |

### Data

| Button | Action |
|---|---|
| Export config | Downloads `qls-config.json` with all tiles and settings |
| Import config | Load a previously exported JSON to restore tiles and settings |
| Reset to defaults | Resets all tiles and settings to defaults and immediately writes the cleared state to the server |

---

## Custom Background Image

1. Open **Settings** → **Appearance**.
2. Click **📁 Upload** next to *Background image* and pick any image file.
3. The image is stored in your browser and applied immediately.
4. Use the **Tile transparency** slider to make tiles more or less opaque over the background.
5. To remove the background, click **✕ Remove** that appears after uploading.

---

## Using Simple Icons

When adding or editing a tile:

1. Under **Icon**, click the **Simple Icons** tab.
2. Type a service name (e.g. `portainer`, `grafana`, `nextcloud`, `jellyfin`).
3. Click **Search** (or press Enter).
4. Click any matching icon to select it — the tile preview updates immediately.
5. If no icon is found, switch to the **Upload** tab to upload your own.

Icons are fetched from [cdn.simpleicons.org](https://cdn.simpleicons.org) — requires internet access on the browser.

---

## Configuration File (`config.json`)

On first visit (no `localStorage` data), QLS reads `config.json` to pre-populate tiles:

```json
{
  "site": {
    "title": "HomeLab",
    "subtitle": "Quick Links & Status"
  },
  "status": {
    "enabled": false,
    "apiUrl": "/api/status",
    "pollIntervalSeconds": 30
  },
  "tiles": [
    {
      "id": "portainer",
      "label": "Portainer",
      "url": "http://nuc:9000",
      "icon": "🐳",
      "description": "Container management",
      "category": "Infrastructure"
    }
  ]
}
```

**Tip:** After customising through the UI, use **Settings → Export config** to download the current state as a backup. The live state is always stored server-side and loaded automatically on every page visit.

---

## Project Structure

```
QLS/
├── index.html          # Dashboard UI
├── style.css           # Dark theme + responsive layout
├── app.js              # Tile management, icons, reachability, settings
├── config.json         # Tile/settings store (written by the API on every save)
├── background.dat      # Background image store (written by the API; pre-create with `touch background.dat`)
├── status.py           # Optional Docker status API (Flask)
├── Dockerfile.status   # Container for status API
├── docker-compose.yml  # Full-stack deployment (port 5555)
├── nginx.conf          # Nginx config with /api/ proxy
└── README.md
```

---

## Keyboard Shortcuts

| Shortcut     | Action          |
|---|---|
| `Ctrl/Cmd+K` | Add new tile    |
| `Escape`     | Close any modal |

---

## Deployment Tips for a NUC

- The default port is **5555**. Change it in `docker-compose.yml` if needed.
- All dashboard changes (tiles, settings, background image) are saved **server-side** to `config.json` and `background.dat` automatically. Every device that loads the site sees the same current state.
- Before first start, pre-create both data files so Docker does not create directories in their place: `touch config.json background.dat`.
- The `docker.sock` mount on `status-api` is read-only — no write access to Docker.
- Background images are stored server-side in `background.dat`. Images up to ~5 MB are supported.
- Put QLS behind a reverse proxy (Traefik, Caddy, nginx) if you want HTTPS or a cleaner URL.

---

## License

MIT
