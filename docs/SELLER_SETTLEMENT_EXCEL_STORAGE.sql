-- Run once in the existing T3 Supabase project.
-- The bucket remains private; only the accepted settlement file types change.
update storage.buckets
set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/png','image/jpeg','image/webp','application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel','text/csv','application/csv','application/octet-stream'
  ]
where id = 'seller-documents';
