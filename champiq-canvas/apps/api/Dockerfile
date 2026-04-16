FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY apps/api/pyproject.toml .
COPY apps/api/champiq_api/ ./champiq_api/
COPY apps/api/scripts/ ./scripts/
COPY manifests/ ./manifests/

RUN uv pip install --system -e .

EXPOSE 8000

CMD ["uvicorn", "champiq_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
