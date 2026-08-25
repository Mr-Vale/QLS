#!/usr/bin/env python3
"""
QLS — Quick Links & Status
Single-container Flask server.

Serves the dashboard (HTML/CSS/JS/assets) and exposes:
  GET  /                          →  dashboard HTML
  GET  /api/status                →  { "container_name": "up"|"down", … }
  GET  /api/config                →  current config.json content
  POST /api/config                →  overwrite config.json with request body
  GET  /api/config/background     →  background image data URL (text/plain)
  POST /api/config/background     →  persist a new background image data URL
  DELETE /api/config/background   →  remove the stored background image
  POST /api/assets/fetch          →  download a remote URL and store it server-side;
                                     returns { "path": "/api/assets/<filename>" }
  GET  /api/assets/<filename>     →  serve a stored asset file

Usage:
    pip install flask docker requests
    python status.py

Environment variables:
    PORT          (default 5000)
    CONTAINERS    comma-separated list of container names to watch;
                  leave empty to return all containers
    CONFIG_PATH   path to config.json (default ./config.json)
    BG_PATH       path to background data file (default ./background.dat)
    ASSETS_DIR    directory for downloaded assets (default ./assets)
    STATIC_DIR    directory for static files: index.html, style.css, app.js
                  (default: same directory as this script)
"""

import hashlib
import ipaddress
import mimetypes
import os
import re
import json
import socket
import urllib.parse
from flask import Flask, jsonify, make_response, request, send_from_directory
from flask.wrappers import Response

try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False

try:
    import requests as _requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

_HERE = os.path.dirname(os.path.abspath(__file__))

STATIC_DIR = os.environ.get("STATIC_DIR", _HERE)
ASSETS_DIR = os.environ.get("ASSETS_DIR", os.path.join(_HERE, "assets"))
os.makedirs(ASSETS_DIR, exist_ok=True)

app = Flask(__name__, static_folder=None)
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


def _content_version(raw: bytes) -> str:
    """Return a stable short content hash for cache/version checks."""
    return hashlib.sha256(raw).hexdigest()[:16]


def _versioned_cache_control() -> str:
    """Long cache for URLs that include a version token."""
    return "public, max-age=31536000, immutable"


def _revalidate_cache_control() -> str:
    """Reusable cache with revalidation for unversioned URLs."""
    return "public, max-age=0, must-revalidate"


def _get_background_version() -> str:
    try:
        with open(BG_PATH, "rb") as f:
            return _content_version(f.read())
    except FileNotFoundError:
        return ""
    except Exception as exc:
        logger.error("Error reading background for versioning: %s", exc)
        return ""


@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            bg_version = _get_background_version()
            if bg_version:
                data["backgroundVersion"] = bg_version
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
        with open(BG_PATH, "rb") as f:
            raw = f.read()
        version = _content_version(raw)
        etag = f"\"{version}\""
        if request.if_none_match and request.if_none_match.contains(etag):
            resp = make_response("", 304)
            resp.headers["ETag"] = etag
            resp.headers["Cache-Control"] = (
                _versioned_cache_control() if request.args.get("v") else _revalidate_cache_control()
            )
            return resp

        resp = make_response(raw)
        resp.headers["Content-Type"] = "text/plain; charset=utf-8"
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = (
            _versioned_cache_control() if request.args.get("v") else _revalidate_cache_control()
        )
        return resp
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


# ---------------------------------------------------------------------------
# Asset fetch — downloads a remote icon/image and stores it server-side.
# POST /api/assets/fetch
# Body (JSON): { "url": "https://cdn.simpleicons.org/portainer" }
# Response:    { "path": "/api/assets/<sha256>.<ext>" }
# ---------------------------------------------------------------------------
_ALLOWED_ASSET_MIME = {
    "image/svg+xml", "image/png", "image/jpeg", "image/gif",
    "image/webp", "image/x-icon", "image/vnd.microsoft.icon",
}
_ASSET_EXT = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}
# Maximum size for a fetched asset (2 MB)
_MAX_ASSET_BYTES = 2 * 1024 * 1024
# Allowed remote URL schemes
_ALLOWED_SCHEMES = {"http", "https"}


def _is_private_host(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback/link-local address.

    This guards against SSRF by preventing the server from fetching resources
    on the local network or loopback interface on behalf of an external caller.
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return True  # treat unresolvable hosts as unsafe
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return True
        except ValueError:
            return True
    return False


@app.route("/api/assets/fetch", methods=["POST"])
def fetch_asset():
    """Download a remote image URL and persist it in ASSETS_DIR."""
    if not REQUESTS_AVAILABLE:
        return jsonify({"error": "requests library not installed"}), 500
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400
    body = request.get_json(silent=True) or {}
    url = body.get("url", "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        return jsonify({"error": "Only http/https URLs are allowed"}), 400

    hostname = parsed.hostname or ""
    if not hostname or _is_private_host(hostname):
        return jsonify({"error": "Requests to private/internal addresses are not allowed"}), 400

    try:
        resp = _requests.get(url, timeout=10, stream=True)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch asset %s: %s", url, exc)
        return jsonify({"error": "Could not fetch remote URL"}), 502

    # Read up to _MAX_ASSET_BYTES before inspecting MIME so we can sniff content
    chunks = []
    total = 0
    for chunk in resp.iter_content(chunk_size=8192):
        total += len(chunk)
        if total > _MAX_ASSET_BYTES:
            return jsonify({"error": "Remote asset is too large (max 2 MB)"}), 413
        chunks.append(chunk)
    data = b"".join(chunks)

    # Determine MIME type: header → URL extension → content sniff (SVG only)
    content_type = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
    if content_type not in _ALLOWED_ASSET_MIME:
        guessed, _ = mimetypes.guess_type(parsed.path)
        if guessed and guessed in _ALLOWED_ASSET_MIME:
            content_type = guessed
        else:
            # Last resort: sniff the first bytes for SVG markers.
            # Many icon CDNs (e.g. cdn.simpleicons.org) serve SVGs without a
            # file extension and without setting Content-Type.  If the content
            # looks like XML/SVG it is safe to treat it as such.
            head = data.lstrip()[:128]
            if head.startswith(b"<svg") or head.startswith(b"<?xml"):
                content_type = "image/svg+xml"
            else:
                # Cannot confirm an allowed image type — reject to avoid storing
                # non-image content (e.g. scripts) disguised as icon files.
                return jsonify({"error": "Remote URL did not return a supported image type"}), 415

    ext = _ASSET_EXT.get(content_type, ".bin")

    # Use SHA-256 of content as filename to deduplicate and avoid collisions
    digest = hashlib.sha256(data).hexdigest()[:24]
    filename = f"{digest}{ext}"
    dest = os.path.join(ASSETS_DIR, filename)

    if not os.path.exists(dest):
        try:
            with open(dest, "wb") as f:
                f.write(data)
        except Exception as exc:
            logger.error("Error writing asset %s: %s", dest, exc)
            return jsonify({"error": "Could not save asset"}), 500

    return jsonify({"path": f"/api/assets/{filename}"})


@app.route("/api/assets/<string:filename>")
def serve_asset(filename):
    """Serve a stored asset from ASSETS_DIR.

    <string:filename> rejects slashes, preventing path-traversal via the URL.
    Flask's send_from_directory also enforces the directory boundary internally.
    """
    response = send_from_directory(ASSETS_DIR, filename, conditional=True)
    response.headers["Cache-Control"] = _versioned_cache_control()
    return response


# ---------------------------------------------------------------------------
# Static file serving — index.html, style.css, app.js and any other files
# in STATIC_DIR.
# NOTE: API routes are registered first in this module, so Flask will always
# prefer them over the catch-all static route below.  New API routes must be
# added above the `index` and `static_files` functions to stay unambiguous.
# ---------------------------------------------------------------------------
_STATIC_EXTENSIONS = {
    ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg",
    ".gif", ".ico", ".woff", ".woff2", ".ttf", ".webp",
}


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    """Serve any static file from STATIC_DIR."""
    # Only allow files with recognised extensions to avoid accidentally
    # exposing data files like config.json or background.dat.
    _, ext = os.path.splitext(filename)
    if ext.lower() not in _STATIC_EXTENSIONS:
        return jsonify({"error": "Not found"}), 404
    response = send_from_directory(STATIC_DIR, filename, conditional=True)
    response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
    return response


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
