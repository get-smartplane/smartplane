-- Calls people add to a rule's test set (`GuardCustomCall`); every verify runs them through the classifier again.
ALTER TABLE guards ADD COLUMN test_calls TEXT NOT NULL DEFAULT '[]';
