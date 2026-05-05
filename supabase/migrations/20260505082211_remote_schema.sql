


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."package_status" AS ENUM (
    'pending',
    'notified',
    'in_transit',
    'ready_for_collection',
    'collected',
    'returned'
);


ALTER TYPE "public"."package_status" OWNER TO "postgres";


CREATE TYPE "public"."staff_role" AS ENUM (
    'warehouse',
    'driver',
    'admin',
    'collection'
);


ALTER TYPE "public"."staff_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_pod_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Log when POD is locked
  IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR OLD.is_locked = false) THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'POD_LOCKED',
      'pod',
      NEW.id,
      COALESCE(auth.uid(), NEW.staff_id),
      jsonb_build_object(
        'pod_reference', NEW.pod_reference,
        'package_id', NEW.package_id,
        'package_reference', NEW.package_reference,
        'locked_at', NEW.locked_at,
        'pdf_generated', NEW.pdf_url IS NOT NULL
      )
    );
  END IF;

  -- Log when PDF is generated
  IF NEW.pdf_url IS NOT NULL AND OLD.pdf_url IS NULL THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'POD_PDF_GENERATED',
      'pod',
      NEW.id,
      COALESCE(auth.uid(), NEW.staff_id),
      jsonb_build_object(
        'pod_reference', NEW.pod_reference,
        'pdf_url', NEW.pdf_url,
        'pdf_path', NEW.pdf_path,
        'generated_at', NEW.pdf_generated_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_pod_changes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_pod_changes"() IS 'Automatically logs POD state changes to audit_logs';



CREATE OR REPLACE FUNCTION "public"."audit_table_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  action_type TEXT;
  entity_data JSONB;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := TG_TABLE_NAME || '_CREATED';
    entity_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := TG_TABLE_NAME || '_UPDATED';
    entity_data := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key != to_jsonb(OLD) -> key
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    action_type := TG_TABLE_NAME || '_DELETED';
    entity_data := to_jsonb(OLD);
  END IF;

  -- Don't audit the audit_logs table itself to prevent infinite loops
  IF TG_TABLE_NAME != 'audit_logs' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      action_type,
      TG_TABLE_NAME,
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.id
        ELSE NEW.id
      END,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      entity_data
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."audit_table_changes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_table_changes"() IS 'Generic trigger function to audit all table changes';



CREATE OR REPLACE FUNCTION "public"."create_initial_admin_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Only auto-create admin profile if:
    -- 1. No admin exists (bootstrap scenario)
    -- 2. No profile exists for this user yet
    IF NOT EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'admin')
       AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE user_id = NEW.id) THEN
        INSERT INTO staff_profiles (user_id, email, full_name, role)
        VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'), 'admin');
    END IF;
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, ignore
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log but don't fail user creation
        RAISE WARNING 'Could not auto-create admin profile: %', SQLERRM;
        RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_initial_admin_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_inventory_quantity"("item_id" "uuid", "decrement_by" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.inventory_items
  SET quantity = GREATEST(0, quantity - decrement_by)
  WHERE id = item_id;
END;
$$;


ALTER FUNCTION "public"."decrement_inventory_quantity"("item_id" "uuid", "decrement_by" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_package_reference"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    date_part TEXT;
    random_part TEXT;
    new_reference TEXT;
    reference_exists BOOLEAN;
BEGIN
    date_part := TO_CHAR(NOW(), 'YYYYMMDD');

    LOOP
        -- Generate 4 random alphanumeric characters
        random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
        new_reference := 'PKG-' || date_part || '-' || random_part;

        -- Check if reference already exists
        SELECT EXISTS(SELECT 1 FROM packages WHERE reference = new_reference) INTO reference_exists;

        EXIT WHEN NOT reference_exists;
    END LOOP;

    RETURN new_reference;
END;
$$;


ALTER FUNCTION "public"."generate_package_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_pod_reference"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  year_part TEXT;
  seq_part TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  seq_part := LPAD(nextval('pod_reference_seq')::TEXT, 4, '0');
  RETURN 'POD-' || year_part || '-' || seq_part;
END;
$$;


ALTER FUNCTION "public"."generate_pod_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") RETURNS TABLE("is_locked" boolean, "locked_at" timestamp with time zone, "pod_reference" "text", "pdf_url" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT pods.is_locked, pods.locked_at, pods.pod_reference, pods.pdf_url
  FROM pods
  WHERE pods.package_id = p_package_id;
END;
$$;


ALTER FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") IS 'Returns detailed lock status for a package POD';



CREATE OR REPLACE FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  locked BOOLEAN;
BEGIN
  SELECT pods.is_locked INTO locked
  FROM pods
  WHERE pods.package_id = p_package_id;

  RETURN COALESCE(locked, false);
END;
$$;


ALTER FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") IS 'Returns whether a package has a locked POD';



CREATE OR REPLACE FUNCTION "public"."notify_drivers_on_new_package"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Call an Edge Function to send push notifications to all drivers
  -- This is optional - the app already listens for real-time changes
  -- Uncomment the following if you want server-side push notifications:

  -- PERFORM net.http_post(
  --   url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
  --   headers := jsonb_build_object(
  --     'Content-Type', 'application/json',
  --     'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
  --   ),
  --   body := jsonb_build_object(
  --     'package_id', NEW.id,
  --     'reference', NEW.reference,
  --     'receiver_name', NEW.receiver_name,
  --     'notification_type', 'new_package'
  --   )::text
  -- );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_drivers_on_new_package"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_package_deletion_when_locked"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  locked_pod_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = OLD.id
    AND pods.is_locked = true
  ) INTO locked_pod_exists;

  IF locked_pod_exists THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'PACKAGE_DELETE_DENIED',
      'package',
      OLD.id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      jsonb_build_object(
        'package_reference', OLD.reference,
        'reason', 'Package has a locked POD',
        'attempted_at', NOW()
      )
    );

    RAISE EXCEPTION 'PACKAGE_DELETE_DENIED: Package % cannot be deleted because it has a locked POD',
      OLD.reference;
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_package_deletion_when_locked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_package_modification_when_locked"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  locked_pod_exists BOOLEAN;
BEGIN
  -- Check if package has a locked POD
  SELECT EXISTS (
    SELECT 1 FROM pods
    WHERE pods.package_id = OLD.id
    AND pods.is_locked = true
  ) INTO locked_pod_exists;

  IF locked_pod_exists THEN
    -- Log the attempted modification
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'PACKAGE_MODIFICATION_DENIED',
      'package',
      OLD.id,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
      jsonb_build_object(
        'package_reference', OLD.reference,
        'reason', 'Package has a locked POD',
        'attempted_at', NOW()
      )
    );

    RAISE EXCEPTION 'PACKAGE_LOCKED: Package % cannot be modified because it has a locked POD',
      OLD.reference;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_package_modification_when_locked"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_package_modification_when_locked"() IS 'Prevents modification of packages that have a locked POD';



CREATE OR REPLACE FUNCTION "public"."prevent_pod_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Log the attempted deletion before raising exception
  INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
  SELECT
    'POD_DELETE_ATTEMPT',
    'pod',
    OLD.id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    jsonb_build_object(
      'pod_reference', OLD.pod_reference,
      'package_id', OLD.package_id,
      'was_locked', OLD.is_locked,
      'attempted_at', NOW(),
      'denial_reason', 'POD records are immutable and cannot be deleted'
    );

  RAISE EXCEPTION 'POD_DELETE_DENIED: POD records cannot be deleted. Record: %, Package: %',
    OLD.pod_reference, OLD.package_reference;
END;
$$;


ALTER FUNCTION "public"."prevent_pod_deletion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_pod_deletion"() IS 'Prevents deletion of POD records and logs the attempt';



CREATE OR REPLACE FUNCTION "public"."prevent_pod_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If record is already locked, prevent any changes
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'POD_LOCKED: Record % is locked and cannot be modified. Locked at: %',
      OLD.pod_reference, OLD.locked_at;
  END IF;

  -- Cannot unlock a record once locked
  IF OLD.is_locked = true AND NEW.is_locked = false THEN
    RAISE EXCEPTION 'POD_UNLOCK_DENIED: Cannot unlock a locked POD record';
  END IF;

  -- If locking, ensure locked_at is set
  IF NEW.is_locked = true AND NEW.locked_at IS NULL THEN
    NEW.locked_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_pod_modification"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_pod_modification"() IS 'Prevents any modifications to locked POD records';



CREATE OR REPLACE FUNCTION "public"."record_package_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."record_package_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_package_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.reference IS NULL OR NEW.reference = '' THEN
        NEW.reference := generate_package_reference();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_package_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_receiver_contacts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_receiver_contacts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_locations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_locations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_package_item_catalog_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_package_item_catalog_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_packages_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_packages_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."driver_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" double precision,
    "heading" double precision,
    "speed" double precision,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."driver_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_locations" IS 'Tracks real-time GPS locations of drivers for admin monitoring';



CREATE OR REPLACE FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision DEFAULT NULL::double precision, "p_heading" double precision DEFAULT NULL::double precision, "p_speed" double precision DEFAULT NULL::double precision) RETURNS "public"."driver_locations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_driver_id UUID;
    v_result driver_locations;
BEGIN
    -- Get the driver's profile ID
    SELECT id INTO v_driver_id
    FROM staff_profiles
    WHERE user_id = auth.uid()
    AND role = 'driver'
    AND is_active = true;

    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'User is not an active driver';
    END IF;

    -- Upsert the location
    INSERT INTO driver_locations (driver_id, user_id, latitude, longitude, accuracy, heading, speed, updated_at)
    VALUES (v_driver_id, auth.uid(), p_latitude, p_longitude, p_accuracy, p_heading, p_speed, NOW())
    ON CONFLICT (driver_id)
    DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        heading = EXCLUDED.heading,
        speed = EXCLUDED.speed,
        updated_at = NOW()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision, "p_heading" double precision, "p_speed" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision, "p_heading" double precision, "p_speed" double precision) IS 'Allows drivers to update their current GPS location';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "performed_by" "uuid" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."audit_logs"."performed_by" IS 'References auth.users(id) - the authenticated user who performed the action';



CREATE TABLE IF NOT EXISTS "public"."delivery_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "google_maps_link" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "notes" "text",
    "description" "text",
    "latitude" double precision,
    "longitude" double precision,
    CONSTRAINT "delivery_locations_geo_chk" CHECK (((("latitude" IS NULL) AND ("longitude" IS NULL)) OR (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL) AND (("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision)) AND (("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))))
);


ALTER TABLE "public"."delivery_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."delivery_locations" IS 'Stores delivery location information with Google Maps integration';



COMMENT ON COLUMN "public"."delivery_locations"."description" IS 'Human-readable description of the delivery point.';



COMMENT ON COLUMN "public"."delivery_locations"."latitude" IS 'Geo latitude in decimal degrees (WGS84).';



COMMENT ON COLUMN "public"."delivery_locations"."longitude" IS 'Geo longitude in decimal degrees (WGS84).';



CREATE TABLE IF NOT EXISTS "public"."driver_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "push_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "driver_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."driver_push_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_push_tokens" IS 'Stores Expo push tokens for driver app notifications';



CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text",
    "description" "text",
    "category" "text",
    "unit" "text" DEFAULT 'pieces'::"text" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "low_stock_threshold" integer DEFAULT 10 NOT NULL,
    "unit_price" numeric(12,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_items_low_stock_threshold_check" CHECK (("low_stock_threshold" >= 0)),
    CONSTRAINT "inventory_items_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "delta" integer NOT NULL,
    "quantity_before" integer DEFAULT 0 NOT NULL,
    "quantity_after" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'manual_edit'::"text" NOT NULL,
    "reference" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_movements_source_check" CHECK (("source" = ANY (ARRAY['initial'::"text", 'manual_edit'::"text", 'package_deduct'::"text", 'restock'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_item_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."package_item_catalog" OWNER TO "postgres";


COMMENT ON TABLE "public"."package_item_catalog" IS 'Catalog of predefined items that can be selected when creating packages';



CREATE TABLE IF NOT EXISTS "public"."package_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_item_id" "uuid",
    CONSTRAINT "package_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."package_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."package_items" IS 'Items contained within a package, with quantity and description';



CREATE TABLE IF NOT EXISTS "public"."package_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."package_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference" "text" NOT NULL,
    "receiver_email" "text" NOT NULL,
    "notes" "text",
    "status" "public"."package_status" DEFAULT 'pending'::"public"."package_status" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "collected_at" timestamp with time zone,
    "collected_by" "uuid",
    "signature_url" "text",
    "signature_path" "text",
    "signed_at" timestamp with time zone,
    "pod_id" "uuid",
    "delivery_location_id" "uuid",
    "po_number" "text",
    "picked_up_by" "uuid",
    "picked_up_at" timestamp with time zone,
    "received_by" "uuid",
    "received_at" timestamp with time zone
);


ALTER TABLE "public"."packages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."packages"."signature_url" IS 'URL to the POD signature image in storage';



COMMENT ON COLUMN "public"."packages"."signature_path" IS 'Storage path of the signature file';



COMMENT ON COLUMN "public"."packages"."signed_at" IS 'Timestamp when the POD was signed';



COMMENT ON COLUMN "public"."packages"."delivery_location_id" IS 'Reference to the delivery location where this package is going';



COMMENT ON COLUMN "public"."packages"."po_number" IS 'Purchase order number for tracking and reference';



COMMENT ON COLUMN "public"."packages"."picked_up_by" IS 'Driver user_id who picked up the package for delivery';



COMMENT ON COLUMN "public"."packages"."picked_up_at" IS 'Timestamp when driver picked up the package';



COMMENT ON COLUMN "public"."packages"."received_by" IS 'Collection point staff user_id who received the package';



COMMENT ON COLUMN "public"."packages"."received_at" IS 'Timestamp when package was received at collection point';



CREATE SEQUENCE IF NOT EXISTS "public"."pod_reference_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pod_reference_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pod_reference" "text" DEFAULT "public"."generate_pod_reference"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "package_reference" "text" NOT NULL,
    "receiver_email" "text" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "staff_name" "text" NOT NULL,
    "staff_email" "text" NOT NULL,
    "signature_url" "text" NOT NULL,
    "signature_path" "text" NOT NULL,
    "signed_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pdf_url" "text",
    "pdf_path" "text",
    "pdf_generated_at" timestamp with time zone,
    "is_locked" boolean DEFAULT false NOT NULL,
    "locked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "receiver_name" "text",
    "receiver_employee_number" "text",
    "receiver_phone" "text",
    "receiver_signature" "text",
    "witness_name" "text",
    "witness_employee_number" "text",
    "witness_phone" "text",
    "witness_signature" "text",
    "completed_by" "uuid"
);


ALTER TABLE "public"."pods" OWNER TO "postgres";


COMMENT ON TABLE "public"."pods" IS 'Immutable Proof of Delivery records';



COMMENT ON COLUMN "public"."pods"."pod_reference" IS 'Unique POD reference number (POD-YYYY-NNNN)';



COMMENT ON COLUMN "public"."pods"."is_locked" IS 'When true, record cannot be modified';



COMMENT ON COLUMN "public"."pods"."locked_at" IS 'Timestamp when record was locked';



COMMENT ON COLUMN "public"."pods"."receiver_signature" IS 'Receiver signature captured at collection time. Stored as a base64 PNG data URL.';



COMMENT ON COLUMN "public"."pods"."witness_signature" IS 'Witness signature captured at collection time. Stored as a base64 PNG data URL.';



CREATE TABLE IF NOT EXISTS "public"."receiver_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receiver_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiver_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "surname" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."receiver_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."receiver_profiles" IS 'Stores receiver/employee profiles who can collect packages';



COMMENT ON COLUMN "public"."receiver_profiles"."phone" IS 'Optional contact phone number';



CREATE TABLE IF NOT EXISTS "public"."staff_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "public"."staff_role" DEFAULT 'warehouse'::"public"."staff_role" NOT NULL,
    "phone" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."staff_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_profiles" IS 'Staff profiles linked to Supabase Auth users with role-based access';



COMMENT ON COLUMN "public"."staff_profiles"."role" IS 'Staff role: warehouse (inventory), driver (deliveries), admin (full access)';



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_locations"
    ADD CONSTRAINT "driver_locations_driver_unique" UNIQUE ("driver_id");



ALTER TABLE ONLY "public"."driver_locations"
    ADD CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_push_tokens"
    ADD CONSTRAINT "driver_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_push_tokens"
    ADD CONSTRAINT "driver_push_tokens_user_id_push_token_key" UNIQUE ("user_id", "push_token");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_item_catalog"
    ADD CONSTRAINT "package_item_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_status_history"
    ADD CONSTRAINT "package_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "pods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "pods_pod_reference_key" UNIQUE ("pod_reference");



ALTER TABLE ONLY "public"."receiver_contacts"
    ADD CONSTRAINT "receiver_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiver_profiles"
    ADD CONSTRAINT "receiver_profiles_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."receiver_profiles"
    ADD CONSTRAINT "receiver_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "unique_package_pod" UNIQUE ("package_id");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity_id" ON "public"."audit_logs" USING "btree" ("entity_id");



CREATE INDEX "idx_audit_logs_entity_type" ON "public"."audit_logs" USING "btree" ("entity_type");



CREATE INDEX "idx_audit_logs_performed_by" ON "public"."audit_logs" USING "btree" ("performed_by");



CREATE INDEX "idx_delivery_locations_created_at" ON "public"."delivery_locations" USING "btree" ("created_at");



CREATE INDEX "idx_delivery_locations_is_active" ON "public"."delivery_locations" USING "btree" ("is_active");



CREATE INDEX "idx_delivery_locations_name" ON "public"."delivery_locations" USING "btree" ("name");



CREATE INDEX "idx_driver_locations_driver_id" ON "public"."driver_locations" USING "btree" ("driver_id");



CREATE INDEX "idx_driver_locations_updated_at" ON "public"."driver_locations" USING "btree" ("updated_at");



CREATE INDEX "idx_driver_locations_user_id" ON "public"."driver_locations" USING "btree" ("user_id");



CREATE INDEX "idx_driver_push_tokens_user_id" ON "public"."driver_push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_items_category" ON "public"."inventory_items" USING "btree" ("category");



CREATE INDEX "idx_inventory_items_is_active" ON "public"."inventory_items" USING "btree" ("is_active");



CREATE INDEX "idx_inventory_items_sku" ON "public"."inventory_items" USING "btree" ("sku");



CREATE INDEX "idx_inventory_movements_created_at" ON "public"."inventory_movements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_movements_item_id" ON "public"."inventory_movements" USING "btree" ("item_id");



CREATE INDEX "idx_inventory_movements_user_id" ON "public"."inventory_movements" USING "btree" ("user_id");



CREATE INDEX "idx_package_item_catalog_is_active" ON "public"."package_item_catalog" USING "btree" ("is_active");



CREATE INDEX "idx_package_item_catalog_name" ON "public"."package_item_catalog" USING "btree" ("name");



CREATE INDEX "idx_package_items_inventory_item_id" ON "public"."package_items" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_package_items_package_id" ON "public"."package_items" USING "btree" ("package_id");



CREATE INDEX "idx_packages_created_at" ON "public"."packages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_packages_created_by" ON "public"."packages" USING "btree" ("created_by");



CREATE INDEX "idx_packages_delivery_location" ON "public"."packages" USING "btree" ("delivery_location_id");



CREATE INDEX "idx_packages_picked_up_by" ON "public"."packages" USING "btree" ("picked_up_by");



CREATE INDEX "idx_packages_po_number" ON "public"."packages" USING "btree" ("po_number");



CREATE INDEX "idx_packages_received_by" ON "public"."packages" USING "btree" ("received_by");



CREATE INDEX "idx_packages_receiver_email" ON "public"."packages" USING "btree" ("receiver_email");



CREATE INDEX "idx_packages_reference" ON "public"."packages" USING "btree" ("reference");



CREATE INDEX "idx_packages_signed_at" ON "public"."packages" USING "btree" ("signed_at");



CREATE INDEX "idx_packages_status" ON "public"."packages" USING "btree" ("status");



CREATE INDEX "idx_pods_completed_at" ON "public"."pods" USING "btree" ("completed_at" DESC);



CREATE INDEX "idx_pods_package_id" ON "public"."pods" USING "btree" ("package_id");



CREATE INDEX "idx_pods_pod_reference" ON "public"."pods" USING "btree" ("pod_reference");



CREATE INDEX "idx_pods_staff_id" ON "public"."pods" USING "btree" ("staff_id");



CREATE INDEX "idx_receiver_profiles_email" ON "public"."receiver_profiles" USING "btree" ("email");



CREATE INDEX "idx_receiver_profiles_is_active" ON "public"."receiver_profiles" USING "btree" ("is_active");



CREATE INDEX "idx_receiver_profiles_name" ON "public"."receiver_profiles" USING "btree" ("name");



CREATE INDEX "idx_receiver_profiles_surname" ON "public"."receiver_profiles" USING "btree" ("surname");



CREATE INDEX "idx_staff_profiles_is_active" ON "public"."staff_profiles" USING "btree" ("is_active");



CREATE INDEX "idx_staff_profiles_role" ON "public"."staff_profiles" USING "btree" ("role");



CREATE INDEX "idx_staff_profiles_user_id" ON "public"."staff_profiles" USING "btree" ("user_id");



CREATE INDEX "package_status_history_changed_at_idx" ON "public"."package_status_history" USING "btree" ("changed_at");



CREATE INDEX "package_status_history_package_id_idx" ON "public"."package_status_history" USING "btree" ("package_id");



CREATE INDEX "pods_completed_at_idx" ON "public"."pods" USING "btree" ("completed_at");



CREATE INDEX "pods_completed_by_idx" ON "public"."pods" USING "btree" ("completed_by");



CREATE UNIQUE INDEX "pods_package_id_unique_idx" ON "public"."pods" USING "btree" ("package_id");



CREATE INDEX "receiver_contacts_receiver_id_idx" ON "public"."receiver_contacts" USING "btree" ("receiver_id");



CREATE OR REPLACE TRIGGER "inventory_items_set_updated_at" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "package_item_catalog_updated_at" BEFORE UPDATE ON "public"."package_item_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."update_package_item_catalog_updated_at"();



CREATE OR REPLACE TRIGGER "trg_package_status_history" AFTER INSERT OR UPDATE OF "status" ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."record_package_status_change"();



CREATE OR REPLACE TRIGGER "trg_receiver_contacts_updated_at" BEFORE UPDATE ON "public"."receiver_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_receiver_contacts_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_audit_packages_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."audit_table_changes"();



CREATE OR REPLACE TRIGGER "trigger_audit_pod_changes" AFTER UPDATE ON "public"."pods" FOR EACH ROW EXECUTE FUNCTION "public"."audit_pod_changes"();



CREATE OR REPLACE TRIGGER "trigger_audit_pods_insert" AFTER INSERT ON "public"."pods" FOR EACH ROW EXECUTE FUNCTION "public"."audit_table_changes"();



CREATE OR REPLACE TRIGGER "trigger_audit_staff_profiles_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_table_changes"();



CREATE OR REPLACE TRIGGER "trigger_prevent_package_deletion_when_locked" BEFORE DELETE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_package_deletion_when_locked"();



CREATE OR REPLACE TRIGGER "trigger_prevent_package_modification_when_locked" BEFORE UPDATE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_package_modification_when_locked"();



CREATE OR REPLACE TRIGGER "trigger_prevent_pod_deletion" BEFORE DELETE ON "public"."pods" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_pod_deletion"();



CREATE OR REPLACE TRIGGER "trigger_prevent_pod_modification" BEFORE UPDATE ON "public"."pods" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_pod_modification"();



CREATE OR REPLACE TRIGGER "trigger_set_package_reference" BEFORE INSERT ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."set_package_reference"();



CREATE OR REPLACE TRIGGER "trigger_update_delivery_locations_updated_at" BEFORE UPDATE ON "public"."delivery_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_locations_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_packages_updated_at" BEFORE UPDATE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."update_packages_updated_at"();



CREATE OR REPLACE TRIGGER "update_receiver_profiles_updated_at" BEFORE UPDATE ON "public"."receiver_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_staff_profiles_updated_at" BEFORE UPDATE ON "public"."staff_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."delivery_locations"
    ADD CONSTRAINT "delivery_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."driver_locations"
    ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."staff_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_locations"
    ADD CONSTRAINT "driver_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_push_tokens"
    ADD CONSTRAINT "driver_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."package_item_catalog"
    ADD CONSTRAINT "package_item_catalog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_status_history"
    ADD CONSTRAINT "package_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."package_status_history"
    ADD CONSTRAINT "package_status_history_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_delivery_location_id_fkey" FOREIGN KEY ("delivery_location_id") REFERENCES "public"."delivery_locations"("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_picked_up_by_fkey" FOREIGN KEY ("picked_up_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "pods_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "pods_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."pods"
    ADD CONSTRAINT "pods_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id");



ALTER TABLE ONLY "public"."receiver_contacts"
    ADD CONSTRAINT "receiver_contacts_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."receiver_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiver_profiles"
    ADD CONSTRAINT "receiver_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create catalog items" ON "public"."package_item_catalog" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Admins can create delivery locations" ON "public"."delivery_locations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can create receiver profiles" ON "public"."receiver_profiles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can create staff profiles" ON "public"."staff_profiles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles" "staff_profiles_1"
  WHERE (("staff_profiles_1"."user_id" = "auth"."uid"()) AND ("staff_profiles_1"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can delete catalog items" ON "public"."package_item_catalog" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Admins can delete delivery locations" ON "public"."delivery_locations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can delete package items" ON "public"."package_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Admins can delete receiver profiles" ON "public"."receiver_profiles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can delete staff profiles" ON "public"."staff_profiles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles" "staff_profiles_1"
  WHERE (("staff_profiles_1"."user_id" = "auth"."uid"()) AND ("staff_profiles_1"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can read all driver locations" ON "public"."driver_locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Admins can update catalog items" ON "public"."package_item_catalog" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Admins can update delivery locations" ON "public"."delivery_locations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can update receiver profiles" ON "public"."receiver_profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Admins can update staff profiles" ON "public"."staff_profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles" "staff_profiles_1"
  WHERE (("staff_profiles_1"."user_id" = "auth"."uid"()) AND ("staff_profiles_1"."role" = 'admin'::"public"."staff_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles" "staff_profiles_1"
  WHERE (("staff_profiles_1"."user_id" = "auth"."uid"()) AND ("staff_profiles_1"."role" = 'admin'::"public"."staff_role")))));



CREATE POLICY "Audit logs cannot be deleted" ON "public"."audit_logs" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Audit logs cannot be updated" ON "public"."audit_logs" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Authenticated users can insert inventory movements" ON "public"."inventory_movements" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can view catalog items" ON "public"."package_item_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view delivery locations" ON "public"."delivery_locations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view inventory" ON "public"."inventory_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view inventory movements" ON "public"."inventory_movements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view package items" ON "public"."package_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view packages" ON "public"."packages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view receiver profiles" ON "public"."receiver_profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view staff profiles" ON "public"."staff_profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Collection staff can complete collection" ON "public"."packages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'collection'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = ANY (ARRAY['pending'::"public"."package_status", 'notified'::"public"."package_status", 'ready_for_collection'::"public"."package_status"])))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'collection'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = 'collected'::"public"."package_status")));



COMMENT ON POLICY "Collection staff can complete collection" ON "public"."packages" IS 'Allows collection point staff to mark packages as collected when receiver picks up the package';



CREATE POLICY "Collection staff can receive packages" ON "public"."packages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'collection'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = 'in_transit'::"public"."package_status"))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'collection'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = 'ready_for_collection'::"public"."package_status")));



CREATE POLICY "Collection staff can view packages" ON "public"."packages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'collection'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Controlled package creation" ON "public"."packages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = ANY (ARRAY['warehouse'::"public"."staff_role", 'admin'::"public"."staff_role"])) AND ("staff_profiles"."is_active" = true)))));



COMMENT ON POLICY "Controlled package creation" ON "public"."packages" IS 'Packages can only be created by authenticated warehouse staff or admins';



CREATE POLICY "Controlled package update" ON "public"."packages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = ANY (ARRAY['warehouse'::"public"."staff_role", 'admin'::"public"."staff_role", 'driver'::"public"."staff_role"])) AND ("staff_profiles"."is_active" = true))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."pods"
  WHERE (("pods"."package_id" = "packages"."id") AND ("pods"."is_locked" = true))))));



COMMENT ON POLICY "Controlled package update" ON "public"."packages" IS 'Packages can only be updated if they do not have a locked POD';



CREATE POLICY "Drivers can pickup packages" ON "public"."packages" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'driver'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = ANY (ARRAY['pending'::"public"."package_status", 'notified'::"public"."package_status"])))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'driver'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND ("status" = 'in_transit'::"public"."package_status")));



CREATE POLICY "Drivers can upsert their own location" ON "public"."driver_locations" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Drivers can view packages" ON "public"."packages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'driver'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "No direct package deletion" ON "public"."packages" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = 'admin'::"public"."staff_role") AND ("staff_profiles"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."pods"
  WHERE (("pods"."package_id" = "packages"."id") AND ("pods"."is_locked" = true)))))));



COMMENT ON POLICY "No direct package deletion" ON "public"."packages" IS 'Only admins can delete packages, and only if no locked POD exists';



CREATE POLICY "Staff can delete inventory" ON "public"."inventory_items" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can insert audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("performed_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."is_active" = true))))));



CREATE POLICY "Staff can insert inventory" ON "public"."inventory_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can read PODs" ON "public"."pods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles" "sp"
  WHERE (("sp"."user_id" = "auth"."uid"()) AND ("sp"."role" = ANY (ARRAY['admin'::"public"."staff_role", 'collection'::"public"."staff_role", 'warehouse'::"public"."staff_role", 'driver'::"public"."staff_role"]))))));



COMMENT ON POLICY "Staff can read PODs" ON "public"."pods" IS 'Allows the dashboard UI to render the proof-of-delivery document for delivered/collected packages.';



CREATE POLICY "Staff can update inventory" ON "public"."inventory_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Users can delete their own push tokens" ON "public"."driver_push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own push tokens" ON "public"."driver_push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."driver_push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own push tokens" ON "public"."driver_push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Warehouse and admins can create package items" ON "public"."package_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = ANY (ARRAY['warehouse'::"public"."staff_role", 'admin'::"public"."staff_role"])) AND ("staff_profiles"."is_active" = true)))));



CREATE POLICY "Warehouse and admins can update package items" ON "public"."package_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = ANY (ARRAY['warehouse'::"public"."staff_role", 'admin'::"public"."staff_role"])) AND ("staff_profiles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff_profiles"
  WHERE (("staff_profiles"."user_id" = "auth"."uid"()) AND ("staff_profiles"."role" = ANY (ARRAY['warehouse'::"public"."staff_role", 'admin'::"public"."staff_role"])) AND ("staff_profiles"."is_active" = true)))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."package_item_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."package_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."package_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "package_status_history_select" ON "public"."package_status_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pods_insert" ON "public"."pods" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "pods_select" ON "public"."pods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pods_update" ON "public"."pods" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."receiver_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receiver_contacts_delete" ON "public"."receiver_contacts" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "receiver_contacts_insert" ON "public"."receiver_contacts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "receiver_contacts_select" ON "public"."receiver_contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "receiver_contacts_update" ON "public"."receiver_contacts" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."receiver_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."packages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."audit_pod_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_pod_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_pod_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_table_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_table_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_table_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_initial_admin_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_initial_admin_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_initial_admin_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_inventory_quantity"("item_id" "uuid", "decrement_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_inventory_quantity"("item_id" "uuid", "decrement_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_inventory_quantity"("item_id" "uuid", "decrement_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_package_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_package_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_package_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_pod_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_pod_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_pod_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pod_lock_status"("p_package_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pod_locked"("p_package_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_drivers_on_new_package"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_drivers_on_new_package"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_drivers_on_new_package"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_package_deletion_when_locked"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_package_deletion_when_locked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_package_deletion_when_locked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_package_modification_when_locked"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_package_modification_when_locked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_package_modification_when_locked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_pod_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_pod_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_pod_deletion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_pod_modification"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_pod_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_pod_modification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_package_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_package_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_package_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_package_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_package_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_package_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_receiver_contacts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_receiver_contacts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_receiver_contacts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_locations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_locations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_locations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_package_item_catalog_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_package_item_catalog_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_package_item_catalog_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_packages_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_packages_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_packages_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."driver_locations" TO "anon";
GRANT ALL ON TABLE "public"."driver_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_locations" TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision, "p_heading" double precision, "p_speed" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision, "p_heading" double precision, "p_speed" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_driver_location"("p_latitude" double precision, "p_longitude" double precision, "p_accuracy" double precision, "p_heading" double precision, "p_speed" double precision) TO "service_role";


















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_locations" TO "anon";
GRANT ALL ON TABLE "public"."delivery_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_locations" TO "service_role";



GRANT ALL ON TABLE "public"."driver_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."driver_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."package_item_catalog" TO "anon";
GRANT ALL ON TABLE "public"."package_item_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."package_item_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."package_items" TO "anon";
GRANT ALL ON TABLE "public"."package_items" TO "authenticated";
GRANT ALL ON TABLE "public"."package_items" TO "service_role";



GRANT ALL ON TABLE "public"."package_status_history" TO "anon";
GRANT ALL ON TABLE "public"."package_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."package_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."packages" TO "anon";
GRANT ALL ON TABLE "public"."packages" TO "authenticated";
GRANT ALL ON TABLE "public"."packages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pod_reference_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pod_reference_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pod_reference_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pods" TO "anon";
GRANT ALL ON TABLE "public"."pods" TO "authenticated";
GRANT ALL ON TABLE "public"."pods" TO "service_role";



GRANT ALL ON TABLE "public"."receiver_contacts" TO "anon";
GRANT ALL ON TABLE "public"."receiver_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."receiver_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."receiver_profiles" TO "anon";
GRANT ALL ON TABLE "public"."receiver_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."receiver_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."staff_profiles" TO "anon";
GRANT ALL ON TABLE "public"."staff_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created_admin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_initial_admin_profile();


  create policy "Authenticated users can read signatures"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'signatures'::text));



  create policy "Authenticated users can upload signatures"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'signatures'::text));



  create policy "Driver insert dn3fju_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'delivery-photos'::text));



  create policy "Public can read POD documents"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'pod-documents'::text));



  create policy "Public can read signatures"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'signatures'::text));



  create policy "Staff can upload POD documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'pod-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))));



  create policy "delivery_photos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'delivery-photos'::text));



  create policy "delivery_photos_select"
  on "storage"."objects"
  as permissive
  for select
  to anon, authenticated
using ((bucket_id = 'delivery-photos'::text));



  create policy "delivery_photos_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'delivery-photos'::text))
with check ((bucket_id = 'delivery-photos'::text));



