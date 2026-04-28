# PF26

## Backend database migrations

This project now uses Alembic for schema and data migrations.

From the `backend` directory:

```bash
alembic -c alembic.ini upgrade head
```

Run this command before starting the backend in every environment.

For existing databases created by legacy runtime migrations:

```bash
alembic -c alembic.ini stamp 20260428_01
alembic -c alembic.ini upgrade head
```
