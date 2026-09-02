# Backup & Restore

What to back up, how, and how to restore - by hand, with `make`, or through the Deployment
page/API. Endpoint names below match `backend/src/routes/deployment.py`.

## Quick reference

| Method | Command / location | Best for |
|---|---|---|
| Makefile | `make db-backup` / `make db-restore BACKUP_FILE=...` | daily operations, cron |
| Admin UI | **Deployment → Export / Database restore** | migrations between hosts |
| API | `POST /admin/deployment/export`, `POST /admin/deployment/restore-database` | automation |
| Manual | `pg_dump` / `psql` in the postgres container | custom workflows |

## What to back up

| Data | Location | Contains |
|---|---|---|
| PostgreSQL | volume `cortex_postgres_data` | users (bcrypt hashes), orgs, API key hashes, model configs, recipes, usage, `config_kv` (session secret, registry) |
| Redis | volume `cortex_redis_data` | rate-limit counters only - safe to lose |
| Model weights | `CORTEX_MODELS_DIR` (`/var/cortex/models`) | never modified or deleted by Cortex |
| HF cache | `HF_CACHE_DIR` | re-downloadable when online |
| Exports | `CORTEX_EXPORT_DIR` (`/var/cortex/exports`) | deployment packages incl. DB dumps - **secret** |
| Prometheus | volume `cortex_prometheus_data` | metrics history; optional |
| Configuration | `.env`, `versions.env` | secrets and pins - store securely |

## Database

### Makefile

```bash
make db-backup            # backups/cortex_backup_YYYYMMDD_HHMMSS.sql (pg_dump, plain SQL)
ls backups/
make db-restore BACKUP_FILE=backups/cortex_backup_20260901_020000.sql
```

Restore replays the SQL into the live database; for a clean restore run `make db-reset`
first (destroys data) or drop the schema by hand. Migrations are applied by the gateway on
its next start.

### Scheduled backups

```bash
crontab -e
# daily 02:00 dump, keep 14 days
0 2 * * * cd /opt/Cortex && make db-backup >/dev/null 2>&1
0 3 * * * find /opt/Cortex/backups -name 'cortex_backup_*.sql' -mtime +14 -delete
# weekly copy of exports and .env to backup storage (adjust)
0 4 * * 0 rsync -a /var/cortex/exports /opt/Cortex/.env backup@nas:/backups/cortex/
```

Model weights are large and static; snapshot `/var/cortex/models` at the storage layer or
`rsync` it after adding models rather than daily.

### Manual

```bash
docker exec -t cortex-postgres-1 pg_dump -U cortex -d cortex > backup.sql
docker exec -i cortex-postgres-1 psql -U cortex -d cortex < backup.sql
```

### Transfer page (bundles) and database restore

The **Transfer** page writes a *bundle* (a self-describing folder: `bundle.json`, `images.json`,
`images/*.tar`, `models/<served>/manifest.json` + `files/`, optional `db/cortex.sql`,
`checksums.sha256`) to the exports directory or to a drive mounted under `/media`, `/mnt` or
`/run/media` on the host. Tick **Include database dump** to add `db/cortex.sql` (users, API key
hashes, model configuration; `hf_token` values are never exported). The full workflow is in
[Offline deployment](offline-deployment.md).

```bash
# export (admin session cookie from `make login`)
curl -X POST http://127.0.0.1:8084/admin/bundles/export -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"destination":"/var/cortex/exports","name":"backup-2026-09-01","include_db_dump":true,"model_ids":[],"image_refs":[],"include_model_files":false}'
curl -b cookies.txt http://127.0.0.1:8084/admin/bundles/status          # job progress

# does the bundle contain a dump?
curl -b cookies.txt "http://127.0.0.1:8084/admin/deployment/database-dump?output_dir=/var/cortex/exports/backup-2026-09-01"

# restore (destructive; a pre-restore backup is written next to the dump when backup_first=true)
curl -X POST http://127.0.0.1:8084/admin/deployment/restore-database -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"output_dir":"/var/cortex/exports/backup-2026-09-01","backup_first":true,"drop_existing":false}'
```

| Endpoint | Purpose |
|---|---|
| `GET /admin/bundles/locations` | transfer locations (exports dir, mounted drives) and bundles found there |
| `GET /admin/bundles/images` | engine / infra / program images with cache state |
| `POST /admin/bundles/plan` | dry-run of an export: contents, size, free space, warnings |
| `POST /admin/bundles/export` | start an export job |
| `GET /admin/bundles/scan?path=&verify=` | inspect a bundle (optionally verify checksums) |
| `POST /admin/bundles/import` | load images, copy model files, register models |
| `GET /admin/bundles/status`, `POST /admin/bundles/cancel` | job tracking |
| `GET /admin/deployment/database-dump?output_dir=` | check for `db/cortex.sql` in a bundle |
| `POST /admin/deployment/restore-database` | restore from that dump (`backup_first`, `drop_existing`) |
| `GET /admin/deployment/jobs`, `GET/DELETE /admin/deployment/jobs/{id}` | job history |

Paths must be absolute and inside a transfer location (`CORTEX_TRANSFER_DIRS`). The UI
(**Transfer**) drives the same endpoints with a job panel.

## Full host migration

1. Source: **Deployment → Export** with images + DB, or `make prepare-offline` for the pinned
   images plus `make db-backup`.
2. Copy `/var/cortex/exports/<dir>`, `/var/cortex/models`, `.env`, `versions.env`.
3. Target: `make load-offline` (images), `make up`, then **Deployment → Database restore**
   (or `make db-restore`), then **Deployment → Import model** for each manifest, then start
   the models.

See [Offline deployment](offline-deployment.md).

## Recovery checklist

1. `make down`
2. restore the database (`make db-restore` or the API)
3. confirm `/var/cortex/models` contains the referenced folders
4. `make up`, `make health`
5. models come back as `stopped`; start them (their configuration is in the database)

## Troubleshooting

| Problem | Fix |
|---|---|
| `relation already exists` during restore | `drop_existing: true`, or `make db-reset` before `make db-restore` |
| `database_dump_not_found` | the dump must be at `<output_dir>/db/cortex_dump.sql`; `ls` it inside the gateway: `docker exec cortex-gateway-1 ls /var/cortex/exports/<dir>/db` |
| restore job fails | `GET /admin/deployment/jobs/{id}` shows the error; `make logs-gateway | grep -i restore` |
| admin cannot log in after restore | the dump carries the old `SESSION_SECRET` in `config_kv` only if `SESSION_SECRET` env was empty; otherwise set the same env value |
