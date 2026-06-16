variable "supabase_access_token" {
  description = "Supabase personal access token (account-level). Set via TF_VAR_supabase_access_token or SUPABASE_ACCESS_TOKEN."
  type        = string
  sensitive   = true
  default     = null
}

variable "organization_id" {
  description = "Supabase organization slug/id that will own the project."
  type        = string
}

variable "project_name" {
  description = "Human-readable name for the Supabase project."
  type        = string
  default     = "musi"
}

variable "region" {
  description = "Supabase region, e.g. us-east-1, us-west-1, eu-central-1."
  type        = string
  default     = "us-east-1"
}

variable "instance_size" {
  description = "Compute instance size for the project (e.g. nano, micro, small)."
  type        = string
  default     = "nano"
}

variable "database_password" {
  description = "Initial Postgres password for the project. Use a long random value and store it in a secret manager."
  type        = string
  sensitive   = true
}

variable "site_url" {
  description = "Primary site URL used for auth redirects (where Musi is hosted)."
  type        = string
  default     = "http://localhost:8080"
}

variable "additional_redirect_urls" {
  description = "Extra allowed redirect URLs for auth (local dev, preview deploys, custom domains)."
  type        = list(string)
  default = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]
}

variable "enable_signup" {
  description = "Allow new users to self-register."
  type        = bool
  default     = true
}
