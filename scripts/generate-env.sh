#!/usr/bin/env bash
set -e

cat > src/environments/environment.ts <<EOF
export const environment = {
  production: false,
  supabaseUrl: "${SUPABASE_URL}",
  supabaseAnonKey: "${SUPABASE_ANON_KEY}",
};
EOF

cat > src/environments/environment.prod.ts <<EOF
export const environment = {
  production: true,
  supabaseUrl: "${SUPABASE_URL}",
  supabaseAnonKey: "${SUPABASE_ANON_KEY}",
};
EOF

echo "Environment files generated for Netlify build."
