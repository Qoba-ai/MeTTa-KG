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
  '200003ee-c651-4069-8b7f-2ad9fb46c3ab',
  'DeepFunding KG', 
  '/',
  NOW(),
  true,
  true,
  true,
  true,
  true
);
