-- 初回 Migration。src/db/schema.ts と一致させること。
-- 日時はすべて UTC の ISO 8601 文字列（B8）。Token はハッシュのみ保存する。

CREATE TABLE circles (
  id TEXT PRIMARY KEY NOT NULL,
  circle_login_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT circles_circle_login_id_unique UNIQUE (circle_login_id)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL REFERENCES circles (id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT members_circle_id_email_unique UNIQUE (circle_id, email),
  CONSTRAINT members_circle_id_id_unique UNIQUE (circle_id, id),
  CONSTRAINT members_role_check CHECK (role IN ('admin', 'member'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT sessions_member_fk FOREIGN KEY (circle_id, member_id)
    REFERENCES members (circle_id, id) ON DELETE CASCADE
);
CREATE INDEX sessions_member_id_idx ON sessions (member_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL REFERENCES circles (id),
  title TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  location TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT events_circle_id_id_unique UNIQUE (circle_id, id),
  CONSTRAINT events_created_by_fk FOREIGN KEY (circle_id, created_by)
    REFERENCES members (circle_id, id),
  CONSTRAINT events_end_after_start_check CHECK (end_at > start_at)
);
CREATE INDEX events_circle_id_end_at_idx ON events (circle_id, end_at);

CREATE TABLE attendances (
  id TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT attendances_event_id_member_id_unique UNIQUE (event_id, member_id),
  CONSTRAINT attendances_event_fk FOREIGN KEY (circle_id, event_id)
    REFERENCES events (circle_id, id) ON DELETE CASCADE,
  CONSTRAINT attendances_member_fk FOREIGN KEY (circle_id, member_id)
    REFERENCES members (circle_id, id),
  CONSTRAINT attendances_status_check CHECK (status IN ('attending', 'absent'))
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL REFERENCES circles (id),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  CONSTRAINT invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT invitations_created_by_fk FOREIGN KEY (circle_id, created_by)
    REFERENCES members (circle_id, id),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked'))
);
CREATE INDEX invitations_circle_id_email_idx ON invitations (circle_id, email);
