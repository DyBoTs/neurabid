DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'neurabid_app') THEN
      CREATE ROLE neurabid_app LOGIN PASSWORD 'neurabid_local_dev_pw';
   END IF;
END
$$;
