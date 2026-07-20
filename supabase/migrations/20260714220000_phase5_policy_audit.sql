-- Phase 5 — audit the policy system itself.
--
-- See docs/access-control-policy-design.md.
--
-- Everything else worth knowing about is already audited (packages, pods, staff
-- profiles). Changes to who can do what were not — which is exactly the change
-- you most want a record of, because it is the one an attacker (or a careless
-- admin) makes right before doing something else.
--
-- audit_logs is append-only at the RLS layer (UPDATE/DELETE are USING (false)),
-- and Phase 0 revoked TRUNCATE from the client roles, so these rows cannot be
-- rewritten or wiped from the browser.

CREATE OR REPLACE FUNCTION public.audit_policy_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action        TEXT;
  v_entity_type   TEXT;
  v_entity_id     UUID;
  v_metadata      JSONB;
BEGIN
  IF TG_TABLE_NAME = 'role_permissions' THEN
    v_entity_type := 'role_permission';
    -- role_permissions has no uuid PK (it is (role, permission_key)), and
    -- audit_logs.entity_id is a uuid — so the identifying pair lives in
    -- metadata and entity_id stays NULL.
    v_entity_id := NULL;

    IF TG_OP = 'INSERT' THEN
      v_action   := 'ROLE_PERMISSION_GRANTED';
      v_metadata := jsonb_build_object('role', NEW.role, 'permission', NEW.permission_key);
    ELSIF TG_OP = 'DELETE' THEN
      v_action   := 'ROLE_PERMISSION_REVOKED';
      v_metadata := jsonb_build_object('role', OLD.role, 'permission', OLD.permission_key);
    ELSE
      v_action   := 'ROLE_PERMISSION_CHANGED';
      v_metadata := jsonb_build_object(
        'from', jsonb_build_object('role', OLD.role, 'permission', OLD.permission_key),
        'to',   jsonb_build_object('role', NEW.role, 'permission', NEW.permission_key)
      );
    END IF;

  ELSE -- user_permissions
    v_entity_type := 'user_permission';
    v_entity_id   := COALESCE(NEW.user_id, OLD.user_id);

    IF TG_OP = 'INSERT' THEN
      v_action   := 'USER_PERMISSION_SET';
      v_metadata := jsonb_build_object(
        'target_user', NEW.user_id,
        'permission',  NEW.permission_key,
        'effect',      NEW.effect
      );
    ELSIF TG_OP = 'DELETE' THEN
      -- The override row is gone, so the user falls back to their role default.
      v_action   := 'USER_PERMISSION_CLEARED';
      v_metadata := jsonb_build_object(
        'target_user', OLD.user_id,
        'permission',  OLD.permission_key,
        'was_effect',  OLD.effect
      );
    ELSE
      v_action   := 'USER_PERMISSION_CHANGED';
      v_metadata := jsonb_build_object(
        'target_user', NEW.user_id,
        'permission',  NEW.permission_key,
        'from_effect', OLD.effect,
        'to_effect',   NEW.effect
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, metadata)
  VALUES (
    v_action,
    v_entity_type,
    v_entity_id,
    -- Matches the convention in audit_table_changes(): a NULL auth.uid() means a
    -- service-role or migration write, recorded as the all-zeros actor rather
    -- than failing the write (performed_by is NOT NULL).
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    v_metadata
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_role_permissions ON public.role_permissions;
CREATE TRIGGER trigger_audit_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_policy_changes();

DROP TRIGGER IF EXISTS trigger_audit_user_permissions ON public.user_permissions;
CREATE TRIGGER trigger_audit_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_policy_changes();

-- Reading the policy audit trail needs orders.audit.view, the same permission
-- that guards the order audit log (admin + manager). No separate permission —
-- one audit trail, one key.
