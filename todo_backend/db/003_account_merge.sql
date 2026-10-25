-- A verified merge can preserve pending receipts from both accounts.
-- New submissions are serialized on the user row and still allow only one pending request.
DROP INDEX IF EXISTS one_pending_payment;
