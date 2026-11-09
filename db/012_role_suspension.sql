-- A suspended role retains referential integrity and can be re-enabled later.
ALTER TABLE platform_account_roles ADD COLUMN enabled boolean NOT NULL DEFAULT true;
