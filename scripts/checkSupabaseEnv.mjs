const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

if (required.some((key) => !process.env[key]?.trim())) {
  console.error('Supabase 운영 환경변수 누락')
  process.exit(1)
}
