terraform {
  required_version = ">= 1.6.0"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.9"
    }
  }

  # Recommended: store state remotely so the project ref / settings are not
  # re-created by another operator. Any backend works; an example using a
  # Supabase-hosted Postgres or an object store is fine. Left local by default
  # so `terraform validate` works out of the box.
  #
  # backend "s3" {
  #   bucket = "musi-tfstate"
  #   key    = "supabase/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "supabase" {
  # Personal access token from https://supabase.com/dashboard/account/tokens
  # Prefer the SUPABASE_ACCESS_TOKEN env var over committing this value.
  access_token = var.supabase_access_token
}
