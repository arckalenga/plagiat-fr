FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/data/.huggingface \
    TRANSFORMERS_CACHE=/data/.huggingface

WORKDIR /app

RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.7.1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py detecteur.py ./

RUN useradd --create-home --uid 1000 appuser && \
    mkdir -p /data/.huggingface && \
    chown -R appuser:appuser /app /data

USER appuser
EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
