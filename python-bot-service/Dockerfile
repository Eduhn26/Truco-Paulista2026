FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data
COPY simulation ./simulation

RUN mkdir -p /app/ml-artifacts/candidate-v1 \
    && python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/Eduhn26/Truco-Paulista2026/releases/download/ml-model-v1.0/truco-hand-win-random-forest.joblib', '/app/ml-artifacts/candidate-v1/truco-hand-win-random-forest.joblib')" \
    && python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/Eduhn26/Truco-Paulista2026/releases/download/ml-model-v1.0/truco-hand-win-random-forest.metadata.json', '/app/ml-artifacts/candidate-v1/truco-hand-win-random-forest.metadata.json')"

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]