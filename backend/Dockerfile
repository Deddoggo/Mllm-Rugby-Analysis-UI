FROM condaforge/mambaforge:latest

WORKDIR /app/backend

COPY environment.yml .

RUN mamba env create -f environment.yml && \
    mamba clean -afy

COPY . .

CMD ["mamba", "run", "--no-capture-output", "-n", "rugby-backend", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
