FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["sh", "-c", "python scripts/create_test_db.py && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
