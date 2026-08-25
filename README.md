# QLS — Quick Links & Status

A fast, polished homelab homepage. Manage tiles, icons, backgrounds, and status checks entirely through the UI — no code editing required. Runs as a **single Docker container** with a Python/Flask server that stores all dashboard state server-side.

---

## Features

- ⚡ **Single-container, lightweight** — plain HTML/CSS/JS frontend, minimal Python/Flask backend
- 🎨 **Polished dark theme** — responsive grid, looks great on desktop and mobile
- ➕ **Add / Edit / Delete tiles** — modal dialog, no code needed
- ↕️ **Drag-and-drop** or **↑↓ buttons** to reorder tiles
- 🗂️ **Category grouping** — tiles can be organised into labelled sections
- 🟢 **Reachability status** — pings each tile URL directly; no backend needed
- 🐳 **Optional Docker API** — lightweight Flask API for container states
- 🖼️ **Custom background** — upload any image via Settings
- 🔲 **Tile transparency** — adjustable opacity slider so the background shows through
- 🔗 **New-tab control** — global default plus per-tile override
- 👁️ **Tile visibility** — toggle icon, title, description, status dot per tile
- 🎨 **Unified icon search** — search Simple Icons + Homelab SVG from one input
- 📁 **Icon upload** — upload custom PNG/SVG/JPG icons when no search result fits
- 💾 **Server-side persistence** — state saved to `config.json`; background to `background.dat`; icons cached in `assets/`
- 📴 **Offline-capable** — icons and backgrounds are downloaded to the server on first use
- ⌨️ **Keyboard shortcut** — `Ctrl/Cmd + K` to quickly add a tile

---

## Quick Start

### Requirements

- Docker and Docker Compose **or** Python 3.12+

### Option A — Docker Compose (recommended)

```bash
# 1. Clone the repository
git clone https://github.com/Mr-Vale/QLS.git
cd QLS

# 2. Build and start the single container
docker compose up -d

# 3. Open in your browser
# http://<host-ip>:5555
```

The dashboard is served at **`http://<host-ip>:5555`** by the Flask app. There is no separate Nginx container.

All dashboard state (tiles, settings, background image, cached icons) is stored in a Docker named volume (`qls-data`), so it **survives container restarts** automatically.

#### Changing the port

Edit `docker-compose.yml` before running `docker compose up`:

```yaml
services:
  qls:
    ports:
      - "8080:5000"   # change 8080 to any port you like
```

Then restart:

```bash
docker compose down
docker compose up -d
```

#### Persistent data

The `qls-data` volume is mounted at `/data` inside the container. It contains:

| File / Directory | Contents |
|---|---|
| `/data/config.json` | Tile and settings state |
| `/data/background.dat` | Background image data URL |
| `/data/assets/` | Downloaded icon and image files |

To back up your data: `docker run --rm -v qls-data:/data -v $(pwd):/backup alpine tar czf /backup/qls-backup.tar.gz /data`

### Option B — Python (no Docker)

```bash
git clone https://github.com/Mr-Vale/QLS.git
cd QLS

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python status.py
# Open http://localhost:5000
```

To use a different port: `PORT=5555 python status.py`

Data files default to the current directory (`./config.json`, `./background.dat`, `./assets/`). Override with environment variables:

```bash
CONFIG_PATH=/home/user/qls/config.json \
BG_PATH=/home/user/qls/background.dat \
ASSETS_DIR=/home/user/qls/assets \
PORT=5555 \
python status.py
```

---

## How It Works

1. The Flask server (`status.py`) serves `index.html`, `style.css`, and `app.js` directly.
2. On page load the browser calls `GET /api/config` — the server returns the saved tile/settings state.
3. Every time you save a tile or change a setting, the browser calls `POST /api/config` to write the new state to `config.json` on the server.
4. When you pick an icon from the search results, the browser calls `POST /api/assets/fetch` — the server downloads the icon and saves it locally; the tile config is updated to point to `/api/assets/<file>` so icons load offline.
5. Background images are stored via `POST /api/config/background` as a data URL in `background.dat`.
6. All devices and browsers see the same state because the server is the single source of truth.

---

## Adding and Managing Tiles

### Add a tile

1. Click **＋** in the top-right corner, or press **Ctrl / Cmd + K**.
2. Fill in the form:
   - **Label** — display name shown on the tile
   - **URL** — the address the tile links to (e.g. `http://192.168.1.10:9000`)
   - **Category** — optional group header (e.g. *Monitoring*, *Media*)
   - **Description** — short subtitle shown under the label
   - **Icon** — use unified search (Simple Icons + Homelab SVG), or upload a PNG/SVG/JPG/GIF
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

> **Note:** The browser uses `no-cors` mode for cross-origin requests, so the status dot shows whether the host is network-reachable, not the HTTP status code.

### Docker container status (optional)

The same Flask server exposes `GET /api/status` for Docker container states.

In **Settings → Container Status API**:

- Enable the toggle
- Set **API URL** to `/api/status`
- Set each tile's **Container name** to the Docker container name

#### Environment variables

| Variable     | Default | Description |
|---|---|---|
| `PORT`       | `5000`  | Port for the Flask server |
| `CONTAINERS` | *(all)* | Comma-separated container names to watch; empty = all |
| `CONFIG_PATH` | `./config.json` | Path to the config file |
| `BG_PATH`    | `./background.dat` | Path to the background image file |
| `ASSETS_DIR` | `./assets` | Directory for cached icon/image files |
| `STATIC_DIR` | *(script dir)* | Directory containing `index.html`, `style.css`, `app.js` |

---

## Settings

Open via the **⚙️** button in the header.

### Appearance

| Setting | Description |
|---|---|
| Site title | Header logo text |
| Subtitle | Header subtitle text |
| Background image | Upload a PNG/JPG/etc. — stored server-side; displays behind the tile grid |
| Tile transparency | Slider 10 %–100 %; lower = more transparent tiles, more background visible |

### Links

| Setting | Description |
|---|---|
| Open in new tab | Global default — checked = all tiles open in a new tab; unchecked = same tab |

Per-tile override: enable **Override: open in new tab** in the tile editor.

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
3. The image is stored server-side and applied immediately.
4. Use the **Tile transparency** slider to make tiles more or less opaque over the background.
5. To remove the background, click **✕ Remove** that appears after uploading.

---

## Using Unified Icon Search

When adding or editing a tile:

1. Under **Icon**, keep the **Icon Search** tab selected.
2. Type a service name (e.g. `portainer`, `grafana`, `nextcloud`, `jellyfin`).
3. Click **Search** (or press Enter).
4. Results from both supported sources appear together with source labels.
5. Click any matching icon to select it — the server downloads and caches the icon so it works offline.
6. If no icon is found, switch to the **Upload** tab to upload your own.

---

## Configuration File (`config.json`)

QLS reads `config.json` from the server on startup:

```json
{
  "settings": {
    "title": "HomeLab",
    "subtitle": "Quick Links & Status",
    "tileOpacity": 90,
    "openInNewTab": true
  },
  "tiles": [
    {
      "id": "portainer",
      "label": "Portainer",
      "url": "http://nuc:9000",
      "icon": "/api/assets/abc123.svg",
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
├── status.py           # Flask server (dashboard + config API + Docker status)
├── requirements.txt    # Python dependencies
├── Dockerfile          # Single-container image
├── docker-compose.yml  # Single-service deployment (port 5555)
└── README.md
```

Data files (not in the image; stored in the `qls-data` volume or local directory):

```
/data/
├── config.json         # Tile/settings store
├── background.dat      # Background image store
└── assets/             # Cached icon and image files
```

---

## Keyboard Shortcuts

| Shortcut     | Action          |
|---|---|
| `Ctrl/Cmd+K` | Add new tile    |
| `Escape`     | Close any modal |

---

## Deployment Tips

- The default port is **5555** (mapped to Flask's internal 5000). Change it in `docker-compose.yml` if needed.
- All dashboard changes are saved **server-side** automatically. Every device that loads the site sees the same current state.
- Icons fetched from the internet are downloaded and cached in `assets/`. The dashboard continues to display them offline after that.
- Put QLS behind a reverse proxy (Traefik, Caddy, nginx) if you want HTTPS or a cleaner URL.
- The `docker.sock` mount is read-only — no write access to Docker.

---

## License

MIT
