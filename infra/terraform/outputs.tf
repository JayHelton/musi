output "project_ref" {
  description = "Project ref (used in the API URL and by the Supabase CLI)."
  value       = supabase_project.musi.id
}

output "api_url" {
  description = "Base URL for the Supabase REST/Auth API. Use as SUPABASE_URL in the frontend."
  value       = "https://${supabase_project.musi.id}.supabase.co"
}

output "anon_key_hint" {
  description = "Where to retrieve the publishable anon key after apply."
  value       = "Run: supabase projects api-keys --project-ref ${supabase_project.musi.id} (anon key is safe to embed in the frontend)."
}
