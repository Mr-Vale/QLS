#!/usr/bin/env python3
"""
QLS Status API — lightweight Flask server for Docker container status.

Exposes GET /api/status           →  { "container_name": "up"|"down", … }
Exposes GET /api/config           →  current config.json content
Exposes POST /api/config          →  overwrite config.json with request body
Exposes GET /api/config/background  →  background image data URL (text/plain)
Exposes POST /api/config/background →  persist a new background image data URL
Exposes DELETE /api/config/background → remove the stored background image

Usage:
    pip install flask docker
    python status.py

Environment variables:
    PORT          (default 5000)
    CONTAINERS    comma-separated list of container names to watch;
                  leave empty to return all containers
    CONFIG_PATH   path to config.json (default ./config.json)
    BG_PATH       path to background data file (default ./background.dat)
"""

import os
import re
import json
from flask import Flask, jsonify, request
from flask.wrappers import Response

try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False

app = Flask(__name__)
# Limit request body size to 5 MB to prevent oversized payloads from being written to disk.
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024


import logging

logger = logging.getLogger(__name__)


def get_status() -> dict:
    if not DOCKER_AVAILABLE:
        return {"error": "docker SDK not installed (pip install docker)"}

    try:
        client = docker.from_env()
    except Exception as exc:
        logger.error("Docker client error: %s", exc)
        return {"error": "Could not connect to Docker"}

    filter_names = [
        n.strip()
        for n in os.environ.get("CONTAINERS", "").split(",")
        if n.strip()
    ]

    result = {}
    try:
        containers = client.containers.list(all=True)
        for c in containers:
            name = c.name
            if filter_names and name not in filter_names:
                continue
            result[name] = "up" if c.status == "running" else "down"
    except Exception as exc:
        logger.error("Error listing containers: %s", exc)
        return {"error": "Failed to list containers"}

    return result


@app.after_request
def add_cors(response: Response) -> Response:
    # Restrict the allowed origin in production; defaults to same-host only.
    # Set the CORS_ORIGIN env var to allow the dashboard origin explicitly,
    # e.g. CORS_ORIGIN=http://192.168.1.10:8080
    origin = os.environ.get("CORS_ORIGIN", "")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
    return response


@app.route("/api/status")
def status():
    return jsonify(get_status())


CONFIG_PATH = os.environ.get("CONFIG_PATH", os.path.join(os.path.dirname(__file__), "config.json"))
BG_PATH = os.environ.get("BG_PATH", os.path.join(os.path.dirname(__file__), "background.dat"))

# Accepted data-URL prefixes for background images
_VALID_BG_RE = re.compile(r"^data:image/[a-z+\-]+;base64,[A-Za-z0-9+/=\r\n]+$")


@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({}), 200
    except Exception as exc:
        logger.error("Error reading config: %s", exc)
        return jsonify({"error": "Could not read config"}), 500


@app.route("/api/config", methods=["POST"])
def save_config():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400
    try:
        data = request.get_json(force=False, silent=False)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"ok": True})
    except Exception as exc:
        logger.error("Error writing config: %s", exc)
        return jsonify({"error": "Could not write config"}), 500


@app.route("/api/config/background", methods=["GET"])
def get_background():
    """Return the stored background data URL, or 404 if none is set."""
    try:
        with open(BG_PATH, "r", encoding="utf-8") as f:
            data_url = f.read()
        return data_url, 200, {"Content-Type": "text/plain; charset=utf-8"}
    except FileNotFoundError:
        return "", 404
    except Exception as exc:
        logger.error("Error reading background: %s", exc)
        return jsonify({"error": "Could not read background"}), 500


@app.route("/api/config/background", methods=["POST"])
def save_background():
    """Persist a background image data URL (text/plain body)."""
    # Accept up to 5 MB (already enforced by MAX_CONTENT_LENGTH)
    data_url = request.get_data(as_text=True)
    if not data_url:
        return jsonify({"error": "Empty body"}), 400
    if not _VALID_BG_RE.match(data_url.strip()):
        return jsonify({"error": "Invalid data URL"}), 400
    try:
        with open(BG_PATH, "w", encoding="utf-8") as f:
            f.write(data_url.strip())
        return jsonify({"ok": True})
    except Exception as exc:
        logger.error("Error writing background: %s", exc)
        return jsonify({"error": "Could not write background"}), 500


@app.route("/api/config/background", methods=["DELETE"])
def delete_background():
    """Remove the stored background image."""
    try:
        os.remove(BG_PATH)
    except FileNotFoundError:
        pass
    except Exception as exc:
        logger.error("Error deleting background: %s", exc)
        return jsonify({"error": "Could not delete background"}), 500
    return jsonify({"ok": True})


@app.route("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
