# QLS — Quick Links & Status

A fast, polished homelab dashboard. Add and manage launchpad tiles through a built-in UI without editing code. Optionally display live Docker container status.

---

## Features

- ⚡ **Static-first, extremely fast** — plain HTML/CSS/JS, no framework
- 🎨 **Polished dark theme** — responsive grid, looks great on desktop & mobile
- ➕ **Add / Edit / Delete tiles** — through a dialog — no code editing needed
- ↕️ **Drag-and-drop** or **↑↓ buttons** to reorder tiles
- 🗂️ **Category grouping** — tiles can be grouped into labelled sections
- 🐳 **Container status** — optional lightweight Python/Flask API polls Docker
- 💾 **Local persistence** — tile data saved to `localStorage`; export/import as JSON
- ⌨️ **Keyboard shortcut** — `Ctrl/Cmd + K` to quickly add a tile

---

## Quick start (plain web server)

No build step needed. Serve the directory with any static file server:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# Caddy / nginx — point root to this directory
```

Open `http://localhost:8080` in your browser.

---

## Docker Compose (recommended for NUC)

Runs the static dashboard **and** the container status API together:

```bash
git clone https://github.com/Mr-Vale/QLS.git
cd QLS
docker compose up -d
```

The dashboard is available at `http://<nuc-ip>:8080`.

Container status is served at `http://<nuc-ip>:5000/api/status`.

### Status API environment variables

| Variable     | Default | Description |
|---|---|---|
| `PORT`       | `5000`  | Port for the Flask status API |
| `CONTAINERS` | *(all)* | Comma-separated list of container names to watch; leave empty for all |

---

## Configuration

### First-time defaults — `config.json`

On the **first visit** (no `localStorage` data), `config.json` is loaded to pre-populate tiles and settings. Edit this file to set your default tiles:

```json
{
  "site": {
    "title": "HomeLab",
    "subtitle": "Quick Links & Status"
  },
  "status": {
    "enabled": true,
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
      "category": "Infrastructure",
      "container": "portainer"
    }
  ]
}
```

**Tip:** After customising through the UI, use **Settings → Export config** to download the current state as `config.json` and commit it. This way the dashboard self-seeds on a fresh install.

---

## Adding / managing tiles

1. Click **＋** (top-right) or press **Ctrl+K** to open the *Add Tile* dialog.
2. Fill in:
   - **Label** — display name
   - **URL** — where the tile links to
   - **Icon** — an emoji (`🐳`) or a full image URL (`https://…/logo.png`)
   - **Description** — short subtitle shown on the tile
   - **Category** — optional group header (e.g. *Monitoring*)
   - **Container name** — Docker container name for the status dot
3. Click **Save Tile**.

### Editing / removing tiles

Click the **✏️ Edit mode** button (or hover a tile and use the action buttons that appear).

- ✏ **Edit** — reopen the dialog
- ↑ / ↓ **Move** — reorder within the list
- ✕ **Remove** — delete with confirmation

### Drag-and-drop reorder

Enable edit mode, then drag any tile to its new position.

---

## Status indicator

Each tile can show a small coloured dot:

| Colour | Meaning |
|---|---|
| 🟢 Green | Container is `running` |
| 🔴 Red   | Container exists but is stopped |
| ⚪ Grey  | Status unknown / not configured |
| 🟡 Yellow (pulsing) | Polling in progress |

Configure the status API in **Settings → Container Status**:

- **Enable status** — toggle polling on/off
- **API URL** — default `/api/status` (proxied by nginx to `status-api:5000`)
- **Poll interval** — how often to refresh (seconds)

---

## Settings panel

Open via the **⚙️** button:

| Option | Description |
|---|---|
| Site title / subtitle | Customise the header text |
| Enable status | Toggle container polling |
| API URL | Status endpoint URL |
| Poll interval | Refresh frequency in seconds |
| Export config | Download tiles + settings as JSON |
| Import config | Load a previously exported JSON |
| Reset to defaults | Clear localStorage and reload `config.json` |

---

## Project structure

```
QLS/
├── index.html          # Dashboard UI
├── style.css           # Dark theme styles
├── app.js              # Tile management + status polling
├── config.json         # Default tile/settings seed
├── status.py           # Docker status API (Flask)
├── Dockerfile.status   # Container for status API
├── docker-compose.yml  # Full-stack deployment
├── nginx.conf          # Nginx config with /api/ proxy
└── README.md
```

---

## Keyboard shortcuts

| Shortcut     | Action          |
|---|---|
| `Ctrl/Cmd+K` | Add new tile    |
| `Escape`     | Close any modal |

---

## Deployment tips for a NUC

- Put QLS behind a reverse proxy (Traefik, Caddy, nginx) if you have other services on port 80/443.
- The `docker.sock` mount on `status-api` gives it read-only access to list containers — no write access.
- Tiles are persisted in the **browser's** `localStorage`. To share the same tile list across devices, export the config and commit `config.json` to the repo, or serve it from a shared location.

---

## License

MIT
