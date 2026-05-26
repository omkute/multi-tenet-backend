-- Enable RLS on all tenant-scoped tables
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"   ENABLE ROW LEVEL SECURITY;

-- RLS policy: Membership — only visible when org context matches
CREATE POLICY tenant_isolation ON "Membership"
  FOR ALL
  USING ("orgId" = current_setting('app.current_org_id', TRUE));

-- RLS policy: Project — only visible when org context matches
CREATE POLICY tenant_isolation ON "Project"
  FOR ALL
  USING ("orgId" = current_setting('app.current_org_id', TRUE));

-- RLS policy: Invite — only visible when org context matches
CREATE POLICY tenant_isolation ON "Invite"
  FOR ALL
  USING ("orgId" = current_setting('app.current_org_id', TRUE));

-- RLS policy: AuditLog — visible when org context matches
-- System-level logs (orgId IS NULL) are not visible through org-scoped queries
CREATE POLICY tenant_isolation ON "AuditLog"
  FOR ALL
  USING ("orgId" = current_setting('app.current_org_id', TRUE));
