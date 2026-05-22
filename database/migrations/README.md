# Database migrations

Apply SQL files in numeric order when evolving the schema outside of Docker init.

1. `../schema.sql` — full bootstrap (used by Docker MySQL `docker-entrypoint-initdb.d` on first run).
2. Add `002_*.sql`, `003_*.sql`, … for incremental changes and run them against your MySQL instance (or fold into `schema.sql` for greenfield setups).

There is no automatic migration runner in this repo; use your SQL client or a tool like `flyway` / `liquibase` if you adopt them later.
