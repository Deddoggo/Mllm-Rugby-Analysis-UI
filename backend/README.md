# Backend

This directory is the future FastAPI orchestration service for Rugby Intelligence.

## Planned responsibilities

- accept and validate video upload requests;
- expose event management endpoints;
- coordinate clip extraction and processing jobs;
- submit event-scoped questions to the AI service;
- return structured analysis responses to the frontend.

`app/main.py` currently defines only the FastAPI application entry point. API routes, business services, persistence, FFmpeg integration, and AI calls are deliberately not implemented.

## Intended structure

```text
app/
  main.py     FastAPI application entry point
  api/        Future HTTP route modules
  services/   Future orchestration services
  models/     Future internal/domain models
  schemas/    Future request and response schemas
```
