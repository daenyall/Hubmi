FROM python:3.11-slim

# Optymalizacja środowiska Pythona w kontenerze
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    ENVIRONMENT=production

WORKDIR /app

# Instalacja narzędzia curl do healthchecku
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalacja zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiowanie kodu aplikacji backendowej
COPY . .

# Bezpieczny użytkownik non-root (zgodność z normami bezpieczeństwa i OWASP)
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

CMD ["python", "run.py"]
