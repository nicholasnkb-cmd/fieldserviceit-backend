# Prisma directory status

SQL migrations in `backend/src/database/migrations` are the sole schema source of truth for the
running application. The Prisma schemas in this directory are compatibility/reference artifacts for
type generation and developer tooling; they do not own production migrations.

Rules:

1. Every schema change starts as a numbered SQL migration.
2. Update reference Prisma schemas in the same change when the tooling model is affected.
3. Do not run `prisma migrate` against any FieldserviceIT environment.
4. Put new runtime queries behind a domain repository instead of adding model-specific behavior to
   `DatabaseService`.
5. Validate clean install and supported upgrade paths before release.
