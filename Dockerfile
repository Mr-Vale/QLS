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

EXPOSE 5000

ENV CONFIG_PATH=/data/config.json \
    BG_PATH=/data/background.dat \
    ASSETS_DIR=/data/assets \
    PORT=5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "status:app"]
