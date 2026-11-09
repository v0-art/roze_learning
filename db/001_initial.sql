-- Transitional entity storage: preserves all fields from the existing application.
-- It is not yet the normalized multi-tenant course schema.
CREATE TABLE IF NOT EXISTS nexus_state_meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  initialized boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO nexus_state_meta(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS nexus_entities (
  collection text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  PRIMARY KEY (collection, position)
);
CREATE INDEX IF NOT EXISTS nexus_entities_record_id ON nexus_entities (collection, (data->>'id'));
CREATE INDEX IF NOT EXISTS nexus_entities_user_id ON nexus_entities (collection, (data->>'userId'));
CREATE INDEX IF NOT EXISTS nexus_entities_lesson_id ON nexus_entities (collection, (data->>'lessonId'));
CREATE TABLE IF NOT EXISTS nexus_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO nexus_schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
