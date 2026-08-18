#!/usr/bin/env python3
"""
QLS Status API — lightweight Flask server for Docker container status.

Exposes GET /api/status  →  { "container_name": "up"|"down", … }

Usage:
    pip install flask docker
    python status.py

Environment variables:
    PORT          (default 5000)
    CONTAINERS    comma-separated list of container names to watch;
                  leave empty to return all containers
"""

import os
import json
from flask import Flask, jsonify
from flask.wrappers import Response

try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False

app = Flask(__name__)


def get_status() -> dict:
    if not DOCKER_AVAILABLE:
        return {"error": "docker SDK not installed (pip install docker)"}

    try:
        client = docker.from_env()
    except Exception as exc:
        return {"error": str(exc)}

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
        return {"error": str(exc)}

    return result


@app.after_request
def add_cors(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.route("/api/status")
def status():
    return jsonify(get_status())


@app.route("/healthz")
def healthz():
    return "ok"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
