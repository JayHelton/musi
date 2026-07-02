# Musi — Supabase Infrastructure (Terraform)

Provisions the **project-level** Supabase resources for Musi as code, so nobody
has to click through the dashboard:

- `supabase_project.musi` — the project itself (region, instance size, db password)
- `supabase_settings.musi` — auth (site URL, redirect allow-list, signups) + API exposure

Database **schema and RLS** are intentionally *not* managed here — they live in
[`../../supabase/migrations`](../../supabase/migrations) and are applied with the
Supabase CLI. SQL migrations are the reviewable, idiomatic way to evolve Postgres
+ row-level security. This split (Terraform for the project, migrations for the
schema) is the pattern Supabase itself recommends.

> Status: **scaffolding** — these files validate (`terraform validate`) but have
> not been `apply`-ed against a real organization. Applying creates billable
> infrastructure.

## Prerequisites

1. A Supabase account + organization.
2. A personal access token: <https://supabase.com/dashboard/account/tokens>.
3. Terraform >= 1.6.

## Usage

```bash
cd infra/terraform

# Secrets via env (preferred over terraform.tfvars):
export SUPABASE_ACCESS_TOKEN=sbp_xxx
export TF_VAR_database_password="$(openssl rand -base64 24)"

cp terraform.tfvars.example terraform.tfvars   # then edit org/region/urls

terraform init
terraform plan
terraform apply

terraform output api_url        # -> SUPABASE_URL for the frontend
terraform output project_ref    # -> used by the Supabase CLI below
```

After apply, fetch the **anon** key (safe to embed in the static frontend) and
push the schema:

```bash
supabase link --project-ref "$(terraform output -raw project_ref)"
supabase db push                # applies ../../supabase/migrations
supabase projects api-keys --project-ref "$(terraform output -raw project_ref)"
```

## Notes

- Commit `.terraform.lock.hcl`; never commit `terraform.tfvars` or `*.tfstate`
  (see `.gitignore`).
- Use a remote backend (commented in `versions.tf`) for any shared/CI usage.
- Add OAuth providers (Google/GitHub/Apple) by extending the `auth` block in
  `main.tf` and supplying their client secrets as additional variables.
