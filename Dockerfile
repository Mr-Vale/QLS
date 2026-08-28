FROM python:3.12-slim
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY status.py .
COPY index.html .
COPY style.css .
COPY app.js .

# Data directory for persistent files (mount a volume here in production)
RUN mkdir -p /data/assets

# Pre-create data files so Docker doesn't create directories in their place
RUN touch /data/config.json /data/background.dat

# Copy static files into /data so they are editable via the mounted volume.
# On first run these files will already be present; on subsequent runs the
# volume-mounted versions (potentially edited by the user) will shadow them.
RUN cp /app/index.html /data/index.html && \
    cp /app/style.css /data/style.css && \
    cp /app/app.js /data/app.js

EXPOSE 5000

ENV CONFIG_PATH=/data/config.json \
    BG_PATH=/data/background.dat \
    ASSETS_DIR=/data/assets \
    STATIC_DIR=/data \
    PORT=5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "status:app"]
