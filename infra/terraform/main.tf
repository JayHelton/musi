# Musi Supabase project, provisioned as code.
#
# This manages PROJECT-LEVEL resources only (the project itself + auth/api
# settings). The database SCHEMA and RLS policies live in ../../supabase/migrations
# and are applied with the Supabase CLI (`supabase db push`) or in CI, because
# SQL migrations are the idiomatic, reviewable way to evolve Postgres + RLS.

resource "supabase_project" "musi" {
  organization_id   = var.organization_id
  name              = var.project_name
  region            = var.region
  instance_size     = var.instance_size
  database_password = var.database_password

  lifecycle {
    # The API never returns the password; ignore drift so plans stay clean.
    ignore_changes = [database_password]
  }
}

resource "supabase_settings" "musi" {
  project_ref = supabase_project.musi.id

  # Auth configuration. Email magic-link is on by default; add external
  # providers (Google, GitHub, Apple) here once their secrets are wired in.
  auth = jsonencode({
    site_url                       = var.site_url
    uri_allow_list                 = join(",", var.additional_redirect_urls)
    disable_signup                 = !var.enable_signup
    jwt_exp                        = 3600
    refresh_token_rotation_enabled = true
    mailer_autoconfirm             = false
    external_email_enabled         = true
  })

  # API/PostgREST exposure. Only the schemas Musi needs are exposed.
  api = jsonencode({
    db_schema            = "public,storage,graphql_public"
    db_extra_search_path = "public,extensions"
    max_rows             = 1000
  })
}
