-- Successful sessions remain in the history after logout and expiry.
CREATE INDEX account_sessions_activity ON account_sessions(account_id,created_at DESC);
