-- Hard rule: one role per person per JV. Existing extra roles are removed, keeping the most recently given one,
-- and each removal is written to the audit log.
INSERT INTO "audit_log" ("action", "jv_id", "entity_type", "entity_id", "before")
SELECT 'role.revoke_one_role_rule', m."jv_id", 'user', m."user_id"::text, jsonb_build_object('role', m."role")
FROM "memberships" m
WHERE EXISTS (
  SELECT 1 FROM "memberships" n
  WHERE n."user_id" = m."user_id" AND n."jv_id" = m."jv_id"
    AND (n."created_at" > m."created_at" OR (n."created_at" = m."created_at" AND n."id" > m."id"))
);--> statement-breakpoint
DELETE FROM "memberships" m
WHERE EXISTS (
  SELECT 1 FROM "memberships" n
  WHERE n."user_id" = m."user_id" AND n."jv_id" = m."jv_id"
    AND (n."created_at" > m."created_at" OR (n."created_at" = m."created_at" AND n."id" > m."id"))
);--> statement-breakpoint
DROP INDEX "memberships_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_role_uq" ON "memberships" USING btree ("user_id","jv_id");
