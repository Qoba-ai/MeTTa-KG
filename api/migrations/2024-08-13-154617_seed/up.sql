INSERT INTO tokens (
  id, 
  code, 
  description, 
  namespace,
  creation_timestamp,
  permission_read,
  permission_write,
  permission_share_share,
  permission_share_read,
  permission_share_write
) VALUES (
  0, 
   gen_random_uuid(), 
  'DeepFunding KG', 
  '/',
  NOW(),
  true,
  true,
  true,
  true,
  true
);
