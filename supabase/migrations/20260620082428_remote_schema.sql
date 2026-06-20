drop extension if exists "pg_net";

create type "public"."package_status" as enum ('pending', 'notified', 'in_transit', 'ready_for_collection', 'collected', 'returned', 'draft');

create type "public"."staff_role" as enum ('warehouse', 'driver', 'admin', 'collection');

create sequence "public"."pod_reference_seq";


  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "action" text not null,
    "entity_type" text not null,
    "entity_id" uuid not null,
    "performed_by" uuid not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."delivery_locations" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "address" text not null,
    "google_maps_link" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "notes" text,
    "description" text,
    "latitude" double precision,
    "longitude" double precision
      );


alter table "public"."delivery_locations" enable row level security;


  create table "public"."driver_locations" (
    "id" uuid not null default gen_random_uuid(),
    "driver_id" uuid not null,
    "user_id" uuid not null,
    "latitude" double precision not null,
    "longitude" double precision not null,
    "accuracy" double precision,
    "heading" double precision,
    "speed" double precision,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."driver_locations" enable row level security;


  create table "public"."driver_push_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "push_token" text not null,
    "platform" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."driver_push_tokens" enable row level security;


  create table "public"."email_templates" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "name" text not null,
    "description" text,
    "subject" text not null,
    "body_html" text not null,
    "variables" jsonb not null default '[]'::jsonb,
    "is_active" boolean not null default true,
    "version" integer not null default 1,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid,
    "cc" text[] default '{}'::text[],
    "bcc" text[] default '{}'::text[]
      );


alter table "public"."email_templates" enable row level security;


  create table "public"."inventory_items" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "sku" text,
    "description" text,
    "category" text,
    "unit" text not null default 'pieces'::text,
    "quantity" integer not null default 0,
    "low_stock_threshold" integer not null default 10,
    "unit_price" numeric(12,2),
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_items" enable row level security;


  create table "public"."inventory_movements" (
    "id" uuid not null default gen_random_uuid(),
    "item_id" uuid not null,
    "user_id" uuid,
    "delta" integer not null,
    "quantity_before" integer not null default 0,
    "quantity_after" integer not null default 0,
    "source" text not null default 'manual_edit'::text,
    "reference" text,
    "note" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_movements" enable row level security;


  create table "public"."package_item_catalog" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );


alter table "public"."package_item_catalog" enable row level security;


  create table "public"."package_items" (
    "id" uuid not null default gen_random_uuid(),
    "package_id" uuid not null,
    "quantity" integer not null default 1,
    "description" text not null,
    "created_at" timestamp with time zone not null default now(),
    "inventory_item_id" uuid
      );


alter table "public"."package_items" enable row level security;


  create table "public"."package_status_history" (
    "id" uuid not null default gen_random_uuid(),
    "package_id" uuid not null,
    "status" text not null,
    "changed_by" uuid,
    "changed_at" timestamp with time zone not null default now(),
    "note" text
      );


alter table "public"."package_status_history" enable row level security;


  create table "public"."packages" (
    "id" uuid not null default gen_random_uuid(),
    "reference" text not null,
    "receiver_email" text not null,
    "notes" text,
    "status" public.package_status not null default 'pending'::public.package_status,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "collected_at" timestamp with time zone,
    "collected_by" uuid,
    "signature_url" text,
    "signature_path" text,
    "signed_at" timestamp with time zone,
    "pod_id" uuid,
    "delivery_location_id" uuid,
    "po_number" text,
    "picked_up_by" uuid,
    "picked_up_at" timestamp with time zone,
    "received_by" uuid,
    "received_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" uuid
      );


alter table "public"."packages" enable row level security;


  create table "public"."pods" (
    "id" uuid not null default gen_random_uuid(),
    "pod_reference" text not null default public.generate_pod_reference(),
    "package_id" uuid not null,
    "package_reference" text not null,
    "receiver_email" text not null,
    "staff_id" uuid not null,
    "staff_name" text not null,
    "staff_email" text not null,
    "signature_url" text not null,
    "signature_path" text not null,
    "signed_at" timestamp with time zone not null,
    "completed_at" timestamp with time zone not null default now(),
    "pdf_url" text,
    "pdf_path" text,
    "pdf_generated_at" timestamp with time zone,
    "is_locked" boolean not null default false,
    "locked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "notes" text,
    "receiver_name" text,
    "receiver_employee_number" text,
    "receiver_phone" text,
    "receiver_signature" text,
    "witness_name" text,
    "witness_employee_number" text,
    "witness_phone" text,
    "witness_signature" text,
    "completed_by" uuid,
    "completion_status" text
      );


alter table "public"."pods" enable row level security;


  create table "public"."purchase_order_item_allocations" (
    "id" uuid not null default gen_random_uuid(),
    "purchase_order_item_id" uuid not null,
    "package_item_id" uuid not null,
    "allocated_quantity" numeric not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."purchase_order_item_allocations" enable row level security;


  create table "public"."purchase_order_items" (
    "id" uuid not null default gen_random_uuid(),
    "purchase_order_id" uuid not null,
    "inventory_item_id" uuid not null,
    "ordered_quantity" numeric not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."purchase_order_items" enable row level security;


  create table "public"."purchase_orders" (
    "id" uuid not null default gen_random_uuid(),
    "po_number" text not null,
    "status" text not null default 'draft'::text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."purchase_orders" enable row level security;


  create table "public"."receiver_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "receiver_id" uuid not null,
    "name" text not null,
    "phone" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."receiver_contacts" enable row level security;


  create table "public"."receiver_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "surname" text not null,
    "email" text not null,
    "phone" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );


alter table "public"."receiver_profiles" enable row level security;


  create table "public"."staff_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "email" text not null,
    "full_name" text not null,
    "role" public.staff_role not null default 'warehouse'::public.staff_role,
    "phone" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );


alter table "public"."staff_profiles" enable row level security;

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX delivery_locations_name_unique ON public.delivery_locations USING btree (name);

CREATE UNIQUE INDEX delivery_locations_pkey ON public.delivery_locations USING btree (id);

CREATE UNIQUE INDEX driver_locations_driver_unique ON public.driver_locations USING btree (driver_id);

CREATE UNIQUE INDEX driver_locations_pkey ON public.driver_locations USING btree (id);

CREATE UNIQUE INDEX driver_push_tokens_pkey ON public.driver_push_tokens USING btree (id);

CREATE UNIQUE INDEX driver_push_tokens_user_id_push_token_key ON public.driver_push_tokens USING btree (user_id, push_token);

CREATE UNIQUE INDEX email_templates_key_key ON public.email_templates USING btree (key);

CREATE UNIQUE INDEX email_templates_pkey ON public.email_templates USING btree (id);

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_entity_id ON public.audit_logs USING btree (entity_id);

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);

CREATE INDEX idx_audit_logs_performed_by ON public.audit_logs USING btree (performed_by);

CREATE INDEX idx_delivery_locations_created_at ON public.delivery_locations USING btree (created_at);

CREATE INDEX idx_delivery_locations_is_active ON public.delivery_locations USING btree (is_active);

CREATE INDEX idx_delivery_locations_name ON public.delivery_locations USING btree (name);

CREATE INDEX idx_driver_locations_driver_id ON public.driver_locations USING btree (driver_id);

CREATE INDEX idx_driver_locations_updated_at ON public.driver_locations USING btree (updated_at);

CREATE INDEX idx_driver_locations_user_id ON public.driver_locations USING btree (user_id);

CREATE INDEX idx_driver_push_tokens_user_id ON public.driver_push_tokens USING btree (user_id);

CREATE INDEX idx_inventory_items_category ON public.inventory_items USING btree (category);

CREATE INDEX idx_inventory_items_is_active ON public.inventory_items USING btree (is_active);

CREATE INDEX idx_inventory_items_sku ON public.inventory_items USING btree (sku);

CREATE INDEX idx_inventory_movements_created_at ON public.inventory_movements USING btree (created_at DESC);

CREATE INDEX idx_inventory_movements_item_id ON public.inventory_movements USING btree (item_id);

CREATE INDEX idx_inventory_movements_user_id ON public.inventory_movements USING btree (user_id);

CREATE INDEX idx_package_item_catalog_is_active ON public.package_item_catalog USING btree (is_active);

CREATE INDEX idx_package_item_catalog_name ON public.package_item_catalog USING btree (name);

CREATE INDEX idx_package_items_inventory_item_id ON public.package_items USING btree (inventory_item_id);

CREATE INDEX idx_package_items_package_id ON public.package_items USING btree (package_id);

CREATE INDEX idx_packages_created_at ON public.packages USING btree (created_at DESC);

CREATE INDEX idx_packages_created_by ON public.packages USING btree (created_by);

CREATE INDEX idx_packages_deleted_at ON public.packages USING btree (deleted_at DESC) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_packages_delivery_location ON public.packages USING btree (delivery_location_id);

CREATE INDEX idx_packages_live ON public.packages USING btree (created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX idx_packages_picked_up_by ON public.packages USING btree (picked_up_by);

CREATE INDEX idx_packages_po_number ON public.packages USING btree (po_number);

CREATE INDEX idx_packages_received_by ON public.packages USING btree (received_by);

CREATE INDEX idx_packages_receiver_email ON public.packages USING btree (receiver_email);

CREATE INDEX idx_packages_reference ON public.packages USING btree (reference);

CREATE INDEX idx_packages_signed_at ON public.packages USING btree (signed_at);

CREATE INDEX idx_packages_status ON public.packages USING btree (status);

CREATE INDEX idx_pods_completed_at ON public.pods USING btree (completed_at DESC);

CREATE INDEX idx_pods_package_id ON public.pods USING btree (package_id);

CREATE INDEX idx_pods_pod_reference ON public.pods USING btree (pod_reference);

CREATE INDEX idx_pods_staff_id ON public.pods USING btree (staff_id);

CREATE INDEX idx_receiver_profiles_email ON public.receiver_profiles USING btree (email);

CREATE INDEX idx_receiver_profiles_is_active ON public.receiver_profiles USING btree (is_active);

CREATE INDEX idx_receiver_profiles_name ON public.receiver_profiles USING btree (name);

CREATE INDEX idx_receiver_profiles_surname ON public.receiver_profiles USING btree (surname);

CREATE INDEX idx_staff_profiles_is_active ON public.staff_profiles USING btree (is_active);

CREATE INDEX idx_staff_profiles_role ON public.staff_profiles USING btree (role);

CREATE INDEX idx_staff_profiles_user_id ON public.staff_profiles USING btree (user_id);

CREATE UNIQUE INDEX inventory_items_pkey ON public.inventory_items USING btree (id);

CREATE UNIQUE INDEX inventory_items_sku_key ON public.inventory_items USING btree (sku);

CREATE UNIQUE INDEX inventory_movements_pkey ON public.inventory_movements USING btree (id);

CREATE UNIQUE INDEX package_item_catalog_pkey ON public.package_item_catalog USING btree (id);

CREATE UNIQUE INDEX package_items_pkey ON public.package_items USING btree (id);

CREATE INDEX package_status_history_changed_at_idx ON public.package_status_history USING btree (changed_at);

CREATE INDEX package_status_history_package_id_idx ON public.package_status_history USING btree (package_id);

CREATE UNIQUE INDEX package_status_history_pkey ON public.package_status_history USING btree (id);

CREATE UNIQUE INDEX packages_pkey ON public.packages USING btree (id);

CREATE UNIQUE INDEX packages_reference_key ON public.packages USING btree (reference);

CREATE INDEX pods_completed_at_idx ON public.pods USING btree (completed_at);

CREATE INDEX pods_completed_by_idx ON public.pods USING btree (completed_by);

CREATE UNIQUE INDEX pods_package_id_unique_idx ON public.pods USING btree (package_id);

CREATE UNIQUE INDEX pods_pkey ON public.pods USING btree (id);

CREATE UNIQUE INDEX pods_pod_reference_key ON public.pods USING btree (pod_reference);

CREATE INDEX purchase_order_item_allocations_package_item_id_idx ON public.purchase_order_item_allocations USING btree (package_item_id);

CREATE UNIQUE INDEX purchase_order_item_allocations_pkey ON public.purchase_order_item_allocations USING btree (id);

CREATE INDEX purchase_order_item_allocations_purchase_order_item_id_idx ON public.purchase_order_item_allocations USING btree (purchase_order_item_id);

CREATE UNIQUE INDEX purchase_order_item_allocations_unique ON public.purchase_order_item_allocations USING btree (purchase_order_item_id, package_item_id);

CREATE INDEX purchase_order_items_inventory_item_id_idx ON public.purchase_order_items USING btree (inventory_item_id);

CREATE UNIQUE INDEX purchase_order_items_pkey ON public.purchase_order_items USING btree (id);

CREATE INDEX purchase_order_items_purchase_order_id_idx ON public.purchase_order_items USING btree (purchase_order_id);

CREATE UNIQUE INDEX purchase_order_items_unique_line ON public.purchase_order_items USING btree (purchase_order_id, inventory_item_id);

CREATE UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id);

CREATE UNIQUE INDEX purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number);

CREATE UNIQUE INDEX receiver_contacts_pkey ON public.receiver_contacts USING btree (id);

CREATE INDEX receiver_contacts_receiver_id_idx ON public.receiver_contacts USING btree (receiver_id);

CREATE UNIQUE INDEX receiver_profiles_email_unique ON public.receiver_profiles USING btree (email);

CREATE UNIQUE INDEX receiver_profiles_pkey ON public.receiver_profiles USING btree (id);

CREATE UNIQUE INDEX staff_profiles_email_unique ON public.staff_profiles USING btree (email);

CREATE INDEX staff_profiles_id_idx ON public.staff_profiles USING btree (id);

CREATE UNIQUE INDEX staff_profiles_pkey ON public.staff_profiles USING btree (id);

CREATE UNIQUE INDEX staff_profiles_user_id_key ON public.staff_profiles USING btree (user_id);

CREATE UNIQUE INDEX unique_package_pod ON public.pods USING btree (package_id);

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."delivery_locations" add constraint "delivery_locations_pkey" PRIMARY KEY using index "delivery_locations_pkey";

alter table "public"."driver_locations" add constraint "driver_locations_pkey" PRIMARY KEY using index "driver_locations_pkey";

alter table "public"."driver_push_tokens" add constraint "driver_push_tokens_pkey" PRIMARY KEY using index "driver_push_tokens_pkey";

alter table "public"."email_templates" add constraint "email_templates_pkey" PRIMARY KEY using index "email_templates_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_pkey" PRIMARY KEY using index "inventory_items_pkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_pkey" PRIMARY KEY using index "inventory_movements_pkey";

alter table "public"."package_item_catalog" add constraint "package_item_catalog_pkey" PRIMARY KEY using index "package_item_catalog_pkey";

alter table "public"."package_items" add constraint "package_items_pkey" PRIMARY KEY using index "package_items_pkey";

alter table "public"."package_status_history" add constraint "package_status_history_pkey" PRIMARY KEY using index "package_status_history_pkey";

alter table "public"."packages" add constraint "packages_pkey" PRIMARY KEY using index "packages_pkey";

alter table "public"."pods" add constraint "pods_pkey" PRIMARY KEY using index "pods_pkey";

alter table "public"."purchase_order_item_allocations" add constraint "purchase_order_item_allocations_pkey" PRIMARY KEY using index "purchase_order_item_allocations_pkey";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_pkey" PRIMARY KEY using index "purchase_order_items_pkey";

alter table "public"."purchase_orders" add constraint "purchase_orders_pkey" PRIMARY KEY using index "purchase_orders_pkey";

alter table "public"."receiver_contacts" add constraint "receiver_contacts_pkey" PRIMARY KEY using index "receiver_contacts_pkey";

alter table "public"."receiver_profiles" add constraint "receiver_profiles_pkey" PRIMARY KEY using index "receiver_profiles_pkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_pkey" PRIMARY KEY using index "staff_profiles_pkey";

alter table "public"."delivery_locations" add constraint "delivery_locations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."delivery_locations" validate constraint "delivery_locations_created_by_fkey";

alter table "public"."delivery_locations" add constraint "delivery_locations_geo_chk" CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR ((latitude IS NOT NULL) AND (longitude IS NOT NULL) AND ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)) AND ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))))) not valid;

alter table "public"."delivery_locations" validate constraint "delivery_locations_geo_chk";

alter table "public"."delivery_locations" add constraint "delivery_locations_name_unique" UNIQUE using index "delivery_locations_name_unique";

alter table "public"."driver_locations" add constraint "driver_locations_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES public.staff_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."driver_locations" validate constraint "driver_locations_driver_id_fkey";

alter table "public"."driver_locations" add constraint "driver_locations_driver_unique" UNIQUE using index "driver_locations_driver_unique";

alter table "public"."driver_locations" add constraint "driver_locations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."driver_locations" validate constraint "driver_locations_user_id_fkey";

alter table "public"."driver_push_tokens" add constraint "driver_push_tokens_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text]))) not valid;

alter table "public"."driver_push_tokens" validate constraint "driver_push_tokens_platform_check";

alter table "public"."driver_push_tokens" add constraint "driver_push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."driver_push_tokens" validate constraint "driver_push_tokens_user_id_fkey";

alter table "public"."driver_push_tokens" add constraint "driver_push_tokens_user_id_push_token_key" UNIQUE using index "driver_push_tokens_user_id_push_token_key";

alter table "public"."email_templates" add constraint "email_templates_key_key" UNIQUE using index "email_templates_key_key";

alter table "public"."email_templates" add constraint "email_templates_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."email_templates" validate constraint "email_templates_updated_by_fkey";

alter table "public"."inventory_items" add constraint "inventory_items_low_stock_threshold_check" CHECK ((low_stock_threshold >= 0)) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_low_stock_threshold_check";

alter table "public"."inventory_items" add constraint "inventory_items_sku_key" UNIQUE using index "inventory_items_sku_key";

alter table "public"."inventory_movements" add constraint "inventory_movements_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_item_id_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_source_check" CHECK ((source = ANY (ARRAY['initial'::text, 'manual_edit'::text, 'package_deduct'::text, 'restock'::text]))) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_source_check";

alter table "public"."inventory_movements" add constraint "inventory_movements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_user_id_fkey";

alter table "public"."package_item_catalog" add constraint "package_item_catalog_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."package_item_catalog" validate constraint "package_item_catalog_created_by_fkey";

alter table "public"."package_items" add constraint "package_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL not valid;

alter table "public"."package_items" validate constraint "package_items_inventory_item_id_fkey";

alter table "public"."package_items" add constraint "package_items_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE not valid;

alter table "public"."package_items" validate constraint "package_items_package_id_fkey";

alter table "public"."package_items" add constraint "package_items_quantity_check" CHECK ((quantity > 0)) not valid;

alter table "public"."package_items" validate constraint "package_items_quantity_check";

alter table "public"."package_status_history" add constraint "package_status_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."package_status_history" validate constraint "package_status_history_changed_by_fkey";

alter table "public"."package_status_history" add constraint "package_status_history_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE not valid;

alter table "public"."package_status_history" validate constraint "package_status_history_package_id_fkey";

alter table "public"."packages" add constraint "packages_collected_by_fkey" FOREIGN KEY (collected_by) REFERENCES auth.users(id) not valid;

alter table "public"."packages" validate constraint "packages_collected_by_fkey";

alter table "public"."packages" add constraint "packages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."packages" validate constraint "packages_created_by_fkey";

alter table "public"."packages" add constraint "packages_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."packages" validate constraint "packages_deleted_by_fkey";

alter table "public"."packages" add constraint "packages_delivery_location_id_fkey" FOREIGN KEY (delivery_location_id) REFERENCES public.delivery_locations(id) not valid;

alter table "public"."packages" validate constraint "packages_delivery_location_id_fkey";

alter table "public"."packages" add constraint "packages_picked_up_by_fkey" FOREIGN KEY (picked_up_by) REFERENCES auth.users(id) not valid;

alter table "public"."packages" validate constraint "packages_picked_up_by_fkey";

alter table "public"."packages" add constraint "packages_pod_id_fkey" FOREIGN KEY (pod_id) REFERENCES public.pods(id) not valid;

alter table "public"."packages" validate constraint "packages_pod_id_fkey";

alter table "public"."packages" add constraint "packages_received_by_fkey" FOREIGN KEY (received_by) REFERENCES auth.users(id) not valid;

alter table "public"."packages" validate constraint "packages_received_by_fkey";

alter table "public"."packages" add constraint "packages_reference_key" UNIQUE using index "packages_reference_key";

alter table "public"."pods" add constraint "pods_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES auth.users(id) not valid;

alter table "public"."pods" validate constraint "pods_completed_by_fkey";

alter table "public"."pods" add constraint "pods_package_id_fkey" FOREIGN KEY (package_id) REFERENCES public.packages(id) not valid;

alter table "public"."pods" validate constraint "pods_package_id_fkey";

alter table "public"."pods" add constraint "pods_pod_reference_key" UNIQUE using index "pods_pod_reference_key";

alter table "public"."pods" add constraint "pods_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id) not valid;

alter table "public"."pods" validate constraint "pods_staff_id_fkey";

alter table "public"."pods" add constraint "unique_package_pod" UNIQUE using index "unique_package_pod";

alter table "public"."purchase_order_item_allocations" add constraint "purchase_order_item_allocations_allocated_quantity_check" CHECK ((allocated_quantity > (0)::numeric)) not valid;

alter table "public"."purchase_order_item_allocations" validate constraint "purchase_order_item_allocations_allocated_quantity_check";

alter table "public"."purchase_order_item_allocations" add constraint "purchase_order_item_allocations_package_item_id_fkey" FOREIGN KEY (package_item_id) REFERENCES public.package_items(id) ON DELETE CASCADE not valid;

alter table "public"."purchase_order_item_allocations" validate constraint "purchase_order_item_allocations_package_item_id_fkey";

alter table "public"."purchase_order_item_allocations" add constraint "purchase_order_item_allocations_purchase_order_item_id_fkey" FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE CASCADE not valid;

alter table "public"."purchase_order_item_allocations" validate constraint "purchase_order_item_allocations_purchase_order_item_id_fkey";

alter table "public"."purchase_order_item_allocations" add constraint "purchase_order_item_allocations_unique" UNIQUE using index "purchase_order_item_allocations_unique";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) not valid;

alter table "public"."purchase_order_items" validate constraint "purchase_order_items_inventory_item_id_fkey";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_ordered_quantity_check" CHECK ((ordered_quantity > (0)::numeric)) not valid;

alter table "public"."purchase_order_items" validate constraint "purchase_order_items_ordered_quantity_check";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE not valid;

alter table "public"."purchase_order_items" validate constraint "purchase_order_items_purchase_order_id_fkey";

alter table "public"."purchase_order_items" add constraint "purchase_order_items_unique_line" UNIQUE using index "purchase_order_items_unique_line";

alter table "public"."purchase_orders" add constraint "purchase_orders_po_number_key" UNIQUE using index "purchase_orders_po_number_key";

alter table "public"."purchase_orders" add constraint "purchase_orders_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'completed'::text]))) not valid;

alter table "public"."purchase_orders" validate constraint "purchase_orders_status_check";

alter table "public"."receiver_contacts" add constraint "receiver_contacts_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES public.receiver_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."receiver_contacts" validate constraint "receiver_contacts_receiver_id_fkey";

alter table "public"."receiver_profiles" add constraint "receiver_profiles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."receiver_profiles" validate constraint "receiver_profiles_created_by_fkey";

alter table "public"."receiver_profiles" add constraint "receiver_profiles_email_unique" UNIQUE using index "receiver_profiles_email_unique";

alter table "public"."staff_profiles" add constraint "staff_profiles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_created_by_fkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_email_unique" UNIQUE using index "staff_profiles_email_unique";

alter table "public"."staff_profiles" add constraint "staff_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_user_id_fkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_user_id_key" UNIQUE using index "staff_profiles_user_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.allocate_purchase_order_item_allocations(p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  missing_po_item_ids text;
  over_allocated_po_item_ids text;
BEGIN
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order allocations payload'
      USING DETAIL = 'p_allocations must be a JSON array';
  END IF;

  IF jsonb_array_length(p_allocations) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
        (row_data->>'package_item_id')::uuid AS package_item_id,
        (row_data->>'allocated_quantity')::numeric AS allocated_quantity
      FROM jsonb_array_elements(p_allocations) row_data
    ) allocation_rows
    WHERE allocation_rows.purchase_order_item_id IS NULL
      OR allocation_rows.package_item_id IS NULL
      OR allocation_rows.allocated_quantity IS NULL
      OR allocation_rows.allocated_quantity <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order allocations payload'
      USING DETAIL = 'Each allocation row must include purchase_order_item_id, package_item_id, and allocated_quantity > 0';
  END IF;

  WITH allocation_rows AS (
    SELECT
      (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
      (row_data->>'package_item_id')::uuid AS package_item_id,
      (row_data->>'allocated_quantity')::numeric AS allocated_quantity
    FROM jsonb_array_elements(p_allocations) row_data
  )
  SELECT string_agg(ar.purchase_order_item_id::text, ',')
  INTO missing_po_item_ids
  FROM (
    SELECT DISTINCT ar.purchase_order_item_id
    FROM allocation_rows ar
    LEFT JOIN public.purchase_order_items poi ON poi.id = ar.purchase_order_item_id
    WHERE poi.id IS NULL
  ) ar;

  IF missing_po_item_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase order item(s) not found'
      USING DETAIL = missing_po_item_ids;
  END IF;

  PERFORM 1
  FROM public.purchase_order_items poi
  WHERE poi.id IN (
    SELECT DISTINCT (row_data->>'purchase_order_item_id')::uuid
    FROM jsonb_array_elements(p_allocations) row_data
  )
  FOR UPDATE;

  WITH allocation_rows AS (
    SELECT
      (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
      (row_data->>'package_item_id')::uuid AS package_item_id,
      (row_data->>'allocated_quantity')::numeric AS allocated_quantity
    FROM jsonb_array_elements(p_allocations) row_data
  ),
  requested_totals AS (
    SELECT
      ar.purchase_order_item_id,
      SUM(ar.allocated_quantity) AS requested_quantity
    FROM allocation_rows ar
    GROUP BY ar.purchase_order_item_id
  ),
  remaining_totals AS (
    SELECT
      poi.id AS purchase_order_item_id,
      (poi.ordered_quantity - COALESCE(SUM(poa.allocated_quantity), 0)) AS remaining_quantity
    FROM public.purchase_order_items poi
    LEFT JOIN public.purchase_order_item_allocations poa
      ON poa.purchase_order_item_id = poi.id
    WHERE poi.id IN (SELECT purchase_order_item_id FROM requested_totals)
    GROUP BY poi.id, poi.ordered_quantity
  )
  SELECT string_agg(rt.purchase_order_item_id::text, ',')
  INTO over_allocated_po_item_ids
  FROM requested_totals rt
  JOIN remaining_totals rem ON rem.purchase_order_item_id = rt.purchase_order_item_id
  WHERE rt.requested_quantity > rem.remaining_quantity;

  IF over_allocated_po_item_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Selected quantity exceeds remaining purchase order quantity'
      USING DETAIL = over_allocated_po_item_ids;
  END IF;

  INSERT INTO public.purchase_order_item_allocations (
    purchase_order_item_id,
    package_item_id,
    allocated_quantity
  )
  SELECT
    (row_data->>'purchase_order_item_id')::uuid,
    (row_data->>'package_item_id')::uuid,
    (row_data->>'allocated_quantity')::numeric
  FROM jsonb_array_elements(p_allocations) row_data;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_pod_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.audit_table_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.bump_email_template_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  IF (TG_OP = 'UPDATE') AND (
       NEW.subject IS DISTINCT FROM OLD.subject
    OR NEW.body_html IS DISTINCT FROM OLD.body_html
  ) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_initial_admin_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_purchase_order_with_items(p_po_number text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(purchase_order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_uid uuid;
  caller_role text;
  payload_items jsonb;
  normalized_po_number text;
  authorized_creator_exists boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := current_setting('request.jwt.claim.role', true);
  normalized_po_number := btrim(COALESCE(p_po_number, ''));
  payload_items := COALESCE(p_items, '[]'::jsonb);

  IF COALESCE(caller_role, '') <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING DETAIL = 'No authenticated user context was found';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = caller_uid
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
    INTO authorized_creator_exists;

    IF NOT authorized_creator_exists THEN
      RAISE EXCEPTION 'Only active warehouse staff or admins can create purchase orders';
    END IF;
  END IF;

  IF normalized_po_number = '' THEN
    RAISE EXCEPTION 'PO number is required';
  END IF;

  IF jsonb_typeof(payload_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  IF jsonb_array_length(payload_items) = 0 THEN
    RAISE EXCEPTION 'At least one PO line is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        NULLIF(btrim(COALESCE(row_data->>'inventory_item_id', '')), '') AS inventory_item_id_text,
        NULLIF(btrim(COALESCE(row_data->>'ordered_quantity', '')), '') AS ordered_quantity_text
      FROM jsonb_array_elements(payload_items) row_data
    ) item_rows
    WHERE item_rows.inventory_item_id_text IS NULL
      OR item_rows.inventory_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR item_rows.ordered_quantity_text IS NULL
      OR item_rows.ordered_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR item_rows.ordered_quantity_text::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'Each item row must include inventory_item_id and ordered_quantity > 0';
  END IF;

  INSERT INTO public.purchase_orders (po_number, status)
  VALUES (normalized_po_number, 'draft')
  RETURNING id INTO purchase_order_id;

  INSERT INTO public.purchase_order_items (
    purchase_order_id,
    inventory_item_id,
    ordered_quantity
  )
  SELECT
    purchase_order_id,
    grouped.inventory_item_id,
    grouped.ordered_quantity
  FROM (
    SELECT
      item_rows.inventory_item_id::uuid AS inventory_item_id,
      SUM(item_rows.ordered_quantity::numeric) AS ordered_quantity
    FROM (
      SELECT
        btrim(COALESCE(row_data->>'inventory_item_id', '')) AS inventory_item_id,
        btrim(COALESCE(row_data->>'ordered_quantity', '')) AS ordered_quantity
      FROM jsonb_array_elements(payload_items) row_data
    ) item_rows
    GROUP BY item_rows.inventory_item_id
  ) grouped;

  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_inventory_quantity(item_id uuid, decrement_by integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.inventory_items
  SET quantity = quantity - decrement_by
  WHERE id = item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_package_reference()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_pod_reference()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  year_part TEXT;
  seq_part TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  seq_part := LPAD(nextval('pod_reference_seq')::TEXT, 4, '0');
  RETURN 'POD-' || year_part || '-' || seq_part;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pod_lock_status(p_package_id uuid)
 RETURNS TABLE(is_locked boolean, locked_at timestamp with time zone, pod_reference text, pdf_url text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT pods.is_locked, pods.locked_at, pods.pod_reference, pods.pdf_url
  FROM pods
  WHERE pods.package_id = p_package_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_pod_locked(p_package_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  locked BOOLEAN;
BEGIN
  SELECT pods.is_locked INTO locked
  FROM pods
  WHERE pods.package_id = p_package_id;

  RETURN COALESCE(locked, false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_drivers_on_new_package()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_package_deletion_when_locked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_package_modification_when_locked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_pod_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_pod_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

create or replace view "public"."public_staff_profiles" as  SELECT id,
    full_name
   FROM public.staff_profiles;


create or replace view "public"."purchase_order_item_balances" as  SELECT poi.id AS purchase_order_item_id,
    poi.purchase_order_id,
    poi.inventory_item_id,
    poi.ordered_quantity,
    COALESCE(sum(poa.allocated_quantity), (0)::numeric) AS allocated_quantity,
    (poi.ordered_quantity - COALESCE(sum(poa.allocated_quantity), (0)::numeric)) AS remaining_quantity
   FROM (public.purchase_order_items poi
     LEFT JOIN public.purchase_order_item_allocations poa ON ((poa.purchase_order_item_id = poi.id)))
  GROUP BY poi.id;


CREATE OR REPLACE FUNCTION public.record_package_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.restore_package(p_package_id uuid)
 RETURNS public.packages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.packages;
  v_email TEXT;
BEGIN
  v_email := (auth.jwt() ->> 'email')::text;
  IF v_email IS NULL OR v_email <> ALL (ARRAY['rendani@email.com']) THEN
    RAISE EXCEPTION 'Not authorized to restore orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_package_id
    AND deleted_at IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or not deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_package_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.reference IS NULL OR NEW.reference = '' THEN
        NEW.reference := generate_package_reference();
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_receiver_contacts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.soft_delete_package(p_package_id uuid)
 RETURNS public.packages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.packages;
  v_email TEXT;
BEGIN
  -- Authorization: only the privileged account may soft-delete orders.
  -- Extract email from JWT token (available to all authenticated users).
  v_email := (auth.jwt() ->> 'email')::text;
  IF v_email IS NULL OR v_email <> ALL (ARRAY['rendani@email.com']) THEN
    RAISE EXCEPTION 'Not authorized to delete orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NOW(),
      deleted_by = auth.uid()
  WHERE id = p_package_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or already deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_delivery_locations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_package_item_catalog_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_packages_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order_with_items(p_purchase_order_id uuid, p_po_number text, p_items jsonb)
 RETURNS TABLE(purchase_order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_uid uuid;
  caller_role text;
  authorized_updater_exists boolean;
  v_status text;
  v_normalized_po_number text;
  v_items jsonb;
  v_item jsonb;
  v_line_id uuid;
  v_ordered_quantity numeric;
  v_allocated_floor numeric;
  v_line_belongs_to_po boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');

  IF caller_role <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized to update purchase orders'
        USING ERRCODE = '42501',
              DETAIL = 'Caller must be an authenticated user or service_role';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = caller_uid
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
    INTO authorized_updater_exists;

    IF NOT authorized_updater_exists THEN
      RAISE EXCEPTION 'Unauthorized to update purchase orders'
        USING ERRCODE = '42501',
              DETAIL = 'Only active warehouse/admin staff profiles may update purchase orders';
    END IF;
  END IF;

  IF p_purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order id is required';
  END IF;

  v_normalized_po_number := btrim(COALESCE(p_po_number, ''));
  IF v_normalized_po_number = '' THEN
    RAISE EXCEPTION 'PO number is required';
  END IF;

  v_items := COALESCE(p_items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        NULLIF(btrim(COALESCE(row_data->>'purchase_order_item_id', '')), '') AS purchase_order_item_id_text,
        NULLIF(btrim(COALESCE(row_data->>'ordered_quantity', '')), '') AS ordered_quantity_text
      FROM jsonb_array_elements(v_items) row_data
    ) item_rows
    WHERE item_rows.purchase_order_item_id_text IS NULL
      OR item_rows.purchase_order_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR item_rows.ordered_quantity_text IS NULL
      OR item_rows.ordered_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR item_rows.ordered_quantity_text::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'Each item row must include purchase_order_item_id and ordered_quantity > 0';
  END IF;

  SELECT po.status
  INTO v_status
  FROM public.purchase_orders po
  WHERE po.id = p_purchase_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Completed purchase orders cannot be edited';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.po_number = v_normalized_po_number
      AND po.id <> p_purchase_order_id
  ) THEN
    RAISE EXCEPTION 'A purchase order with this number already exists';
  END IF;

  PERFORM 1
  FROM (
    SELECT DISTINCT (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id
    FROM jsonb_array_elements(v_items) row_data
  ) requested_items
  JOIN public.purchase_order_items poi
    ON poi.id = requested_items.purchase_order_item_id
   AND poi.purchase_order_id = p_purchase_order_id
  ORDER BY poi.id
  FOR UPDATE OF poi;

  FOR v_item IN
    SELECT row_data
    FROM jsonb_array_elements(v_items) row_data
  LOOP
    v_line_id := (v_item->>'purchase_order_item_id')::uuid;
    v_ordered_quantity := (v_item->>'ordered_quantity')::numeric;

    SELECT EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      WHERE poi.id = v_line_id
        AND poi.purchase_order_id = p_purchase_order_id
    )
    INTO v_line_belongs_to_po;

    IF NOT v_line_belongs_to_po THEN
      RAISE EXCEPTION 'Purchase order line not found for this purchase order: %', v_line_id;
    END IF;

    SELECT COALESCE(SUM(poa.allocated_quantity), 0)
    INTO v_allocated_floor
    FROM public.purchase_order_item_allocations poa
    WHERE poa.purchase_order_item_id = v_line_id;

    IF v_ordered_quantity < v_allocated_floor THEN
      RAISE EXCEPTION 'Ordered quantity cannot be below allocated quantity for line %', v_line_id;
    END IF;

    UPDATE public.purchase_order_items poi
    SET ordered_quantity = v_ordered_quantity,
        updated_at = timezone('utc', now())
    WHERE poi.id = v_line_id
      AND poi.purchase_order_id = p_purchase_order_id;
  END LOOP;

  UPDATE public.purchase_orders po
  SET po_number = v_normalized_po_number,
      updated_at = timezone('utc', now())
  WHERE po.id = p_purchase_order_id;

  purchase_order_id := p_purchase_order_id;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_driver_location(p_latitude double precision, p_longitude double precision, p_accuracy double precision DEFAULT NULL::double precision, p_heading double precision DEFAULT NULL::double precision, p_speed double precision DEFAULT NULL::double precision)
 RETURNS public.driver_locations
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."delivery_locations" to "anon";

grant insert on table "public"."delivery_locations" to "anon";

grant references on table "public"."delivery_locations" to "anon";

grant select on table "public"."delivery_locations" to "anon";

grant trigger on table "public"."delivery_locations" to "anon";

grant truncate on table "public"."delivery_locations" to "anon";

grant update on table "public"."delivery_locations" to "anon";

grant delete on table "public"."delivery_locations" to "authenticated";

grant insert on table "public"."delivery_locations" to "authenticated";

grant references on table "public"."delivery_locations" to "authenticated";

grant select on table "public"."delivery_locations" to "authenticated";

grant trigger on table "public"."delivery_locations" to "authenticated";

grant truncate on table "public"."delivery_locations" to "authenticated";

grant update on table "public"."delivery_locations" to "authenticated";

grant delete on table "public"."delivery_locations" to "service_role";

grant insert on table "public"."delivery_locations" to "service_role";

grant references on table "public"."delivery_locations" to "service_role";

grant select on table "public"."delivery_locations" to "service_role";

grant trigger on table "public"."delivery_locations" to "service_role";

grant truncate on table "public"."delivery_locations" to "service_role";

grant update on table "public"."delivery_locations" to "service_role";

grant delete on table "public"."driver_locations" to "anon";

grant insert on table "public"."driver_locations" to "anon";

grant references on table "public"."driver_locations" to "anon";

grant select on table "public"."driver_locations" to "anon";

grant trigger on table "public"."driver_locations" to "anon";

grant truncate on table "public"."driver_locations" to "anon";

grant update on table "public"."driver_locations" to "anon";

grant delete on table "public"."driver_locations" to "authenticated";

grant insert on table "public"."driver_locations" to "authenticated";

grant references on table "public"."driver_locations" to "authenticated";

grant select on table "public"."driver_locations" to "authenticated";

grant trigger on table "public"."driver_locations" to "authenticated";

grant truncate on table "public"."driver_locations" to "authenticated";

grant update on table "public"."driver_locations" to "authenticated";

grant delete on table "public"."driver_locations" to "service_role";

grant insert on table "public"."driver_locations" to "service_role";

grant references on table "public"."driver_locations" to "service_role";

grant select on table "public"."driver_locations" to "service_role";

grant trigger on table "public"."driver_locations" to "service_role";

grant truncate on table "public"."driver_locations" to "service_role";

grant update on table "public"."driver_locations" to "service_role";

grant delete on table "public"."driver_push_tokens" to "anon";

grant insert on table "public"."driver_push_tokens" to "anon";

grant references on table "public"."driver_push_tokens" to "anon";

grant select on table "public"."driver_push_tokens" to "anon";

grant trigger on table "public"."driver_push_tokens" to "anon";

grant truncate on table "public"."driver_push_tokens" to "anon";

grant update on table "public"."driver_push_tokens" to "anon";

grant delete on table "public"."driver_push_tokens" to "authenticated";

grant insert on table "public"."driver_push_tokens" to "authenticated";

grant references on table "public"."driver_push_tokens" to "authenticated";

grant select on table "public"."driver_push_tokens" to "authenticated";

grant trigger on table "public"."driver_push_tokens" to "authenticated";

grant truncate on table "public"."driver_push_tokens" to "authenticated";

grant update on table "public"."driver_push_tokens" to "authenticated";

grant delete on table "public"."driver_push_tokens" to "service_role";

grant insert on table "public"."driver_push_tokens" to "service_role";

grant references on table "public"."driver_push_tokens" to "service_role";

grant select on table "public"."driver_push_tokens" to "service_role";

grant trigger on table "public"."driver_push_tokens" to "service_role";

grant truncate on table "public"."driver_push_tokens" to "service_role";

grant update on table "public"."driver_push_tokens" to "service_role";

grant delete on table "public"."email_templates" to "anon";

grant insert on table "public"."email_templates" to "anon";

grant references on table "public"."email_templates" to "anon";

grant select on table "public"."email_templates" to "anon";

grant trigger on table "public"."email_templates" to "anon";

grant truncate on table "public"."email_templates" to "anon";

grant update on table "public"."email_templates" to "anon";

grant delete on table "public"."email_templates" to "authenticated";

grant insert on table "public"."email_templates" to "authenticated";

grant references on table "public"."email_templates" to "authenticated";

grant select on table "public"."email_templates" to "authenticated";

grant trigger on table "public"."email_templates" to "authenticated";

grant truncate on table "public"."email_templates" to "authenticated";

grant update on table "public"."email_templates" to "authenticated";

grant delete on table "public"."email_templates" to "service_role";

grant insert on table "public"."email_templates" to "service_role";

grant references on table "public"."email_templates" to "service_role";

grant select on table "public"."email_templates" to "service_role";

grant trigger on table "public"."email_templates" to "service_role";

grant truncate on table "public"."email_templates" to "service_role";

grant update on table "public"."email_templates" to "service_role";

grant delete on table "public"."inventory_items" to "anon";

grant insert on table "public"."inventory_items" to "anon";

grant references on table "public"."inventory_items" to "anon";

grant select on table "public"."inventory_items" to "anon";

grant trigger on table "public"."inventory_items" to "anon";

grant truncate on table "public"."inventory_items" to "anon";

grant update on table "public"."inventory_items" to "anon";

grant delete on table "public"."inventory_items" to "authenticated";

grant insert on table "public"."inventory_items" to "authenticated";

grant references on table "public"."inventory_items" to "authenticated";

grant select on table "public"."inventory_items" to "authenticated";

grant trigger on table "public"."inventory_items" to "authenticated";

grant truncate on table "public"."inventory_items" to "authenticated";

grant update on table "public"."inventory_items" to "authenticated";

grant delete on table "public"."inventory_items" to "service_role";

grant insert on table "public"."inventory_items" to "service_role";

grant references on table "public"."inventory_items" to "service_role";

grant select on table "public"."inventory_items" to "service_role";

grant trigger on table "public"."inventory_items" to "service_role";

grant truncate on table "public"."inventory_items" to "service_role";

grant update on table "public"."inventory_items" to "service_role";

grant delete on table "public"."inventory_movements" to "anon";

grant insert on table "public"."inventory_movements" to "anon";

grant references on table "public"."inventory_movements" to "anon";

grant select on table "public"."inventory_movements" to "anon";

grant trigger on table "public"."inventory_movements" to "anon";

grant truncate on table "public"."inventory_movements" to "anon";

grant update on table "public"."inventory_movements" to "anon";

grant delete on table "public"."inventory_movements" to "authenticated";

grant insert on table "public"."inventory_movements" to "authenticated";

grant references on table "public"."inventory_movements" to "authenticated";

grant select on table "public"."inventory_movements" to "authenticated";

grant trigger on table "public"."inventory_movements" to "authenticated";

grant truncate on table "public"."inventory_movements" to "authenticated";

grant update on table "public"."inventory_movements" to "authenticated";

grant delete on table "public"."inventory_movements" to "service_role";

grant insert on table "public"."inventory_movements" to "service_role";

grant references on table "public"."inventory_movements" to "service_role";

grant select on table "public"."inventory_movements" to "service_role";

grant trigger on table "public"."inventory_movements" to "service_role";

grant truncate on table "public"."inventory_movements" to "service_role";

grant update on table "public"."inventory_movements" to "service_role";

grant delete on table "public"."package_item_catalog" to "anon";

grant insert on table "public"."package_item_catalog" to "anon";

grant references on table "public"."package_item_catalog" to "anon";

grant select on table "public"."package_item_catalog" to "anon";

grant trigger on table "public"."package_item_catalog" to "anon";

grant truncate on table "public"."package_item_catalog" to "anon";

grant update on table "public"."package_item_catalog" to "anon";

grant delete on table "public"."package_item_catalog" to "authenticated";

grant insert on table "public"."package_item_catalog" to "authenticated";

grant references on table "public"."package_item_catalog" to "authenticated";

grant select on table "public"."package_item_catalog" to "authenticated";

grant trigger on table "public"."package_item_catalog" to "authenticated";

grant truncate on table "public"."package_item_catalog" to "authenticated";

grant update on table "public"."package_item_catalog" to "authenticated";

grant delete on table "public"."package_item_catalog" to "service_role";

grant insert on table "public"."package_item_catalog" to "service_role";

grant references on table "public"."package_item_catalog" to "service_role";

grant select on table "public"."package_item_catalog" to "service_role";

grant trigger on table "public"."package_item_catalog" to "service_role";

grant truncate on table "public"."package_item_catalog" to "service_role";

grant update on table "public"."package_item_catalog" to "service_role";

grant delete on table "public"."package_items" to "anon";

grant insert on table "public"."package_items" to "anon";

grant references on table "public"."package_items" to "anon";

grant select on table "public"."package_items" to "anon";

grant trigger on table "public"."package_items" to "anon";

grant truncate on table "public"."package_items" to "anon";

grant update on table "public"."package_items" to "anon";

grant delete on table "public"."package_items" to "authenticated";

grant insert on table "public"."package_items" to "authenticated";

grant references on table "public"."package_items" to "authenticated";

grant select on table "public"."package_items" to "authenticated";

grant trigger on table "public"."package_items" to "authenticated";

grant truncate on table "public"."package_items" to "authenticated";

grant update on table "public"."package_items" to "authenticated";

grant delete on table "public"."package_items" to "service_role";

grant insert on table "public"."package_items" to "service_role";

grant references on table "public"."package_items" to "service_role";

grant select on table "public"."package_items" to "service_role";

grant trigger on table "public"."package_items" to "service_role";

grant truncate on table "public"."package_items" to "service_role";

grant update on table "public"."package_items" to "service_role";

grant delete on table "public"."package_status_history" to "anon";

grant insert on table "public"."package_status_history" to "anon";

grant references on table "public"."package_status_history" to "anon";

grant select on table "public"."package_status_history" to "anon";

grant trigger on table "public"."package_status_history" to "anon";

grant truncate on table "public"."package_status_history" to "anon";

grant update on table "public"."package_status_history" to "anon";

grant delete on table "public"."package_status_history" to "authenticated";

grant insert on table "public"."package_status_history" to "authenticated";

grant references on table "public"."package_status_history" to "authenticated";

grant select on table "public"."package_status_history" to "authenticated";

grant trigger on table "public"."package_status_history" to "authenticated";

grant truncate on table "public"."package_status_history" to "authenticated";

grant update on table "public"."package_status_history" to "authenticated";

grant delete on table "public"."package_status_history" to "service_role";

grant insert on table "public"."package_status_history" to "service_role";

grant references on table "public"."package_status_history" to "service_role";

grant select on table "public"."package_status_history" to "service_role";

grant trigger on table "public"."package_status_history" to "service_role";

grant truncate on table "public"."package_status_history" to "service_role";

grant update on table "public"."package_status_history" to "service_role";

grant delete on table "public"."packages" to "anon";

grant insert on table "public"."packages" to "anon";

grant references on table "public"."packages" to "anon";

grant select on table "public"."packages" to "anon";

grant trigger on table "public"."packages" to "anon";

grant truncate on table "public"."packages" to "anon";

grant update on table "public"."packages" to "anon";

grant delete on table "public"."packages" to "authenticated";

grant insert on table "public"."packages" to "authenticated";

grant references on table "public"."packages" to "authenticated";

grant select on table "public"."packages" to "authenticated";

grant trigger on table "public"."packages" to "authenticated";

grant truncate on table "public"."packages" to "authenticated";

grant update on table "public"."packages" to "authenticated";

grant delete on table "public"."packages" to "service_role";

grant insert on table "public"."packages" to "service_role";

grant references on table "public"."packages" to "service_role";

grant select on table "public"."packages" to "service_role";

grant trigger on table "public"."packages" to "service_role";

grant truncate on table "public"."packages" to "service_role";

grant update on table "public"."packages" to "service_role";

grant delete on table "public"."pods" to "anon";

grant insert on table "public"."pods" to "anon";

grant references on table "public"."pods" to "anon";

grant select on table "public"."pods" to "anon";

grant trigger on table "public"."pods" to "anon";

grant truncate on table "public"."pods" to "anon";

grant update on table "public"."pods" to "anon";

grant delete on table "public"."pods" to "authenticated";

grant insert on table "public"."pods" to "authenticated";

grant references on table "public"."pods" to "authenticated";

grant select on table "public"."pods" to "authenticated";

grant trigger on table "public"."pods" to "authenticated";

grant truncate on table "public"."pods" to "authenticated";

grant update on table "public"."pods" to "authenticated";

grant delete on table "public"."pods" to "service_role";

grant insert on table "public"."pods" to "service_role";

grant references on table "public"."pods" to "service_role";

grant select on table "public"."pods" to "service_role";

grant trigger on table "public"."pods" to "service_role";

grant truncate on table "public"."pods" to "service_role";

grant update on table "public"."pods" to "service_role";

grant delete on table "public"."purchase_order_item_allocations" to "anon";

grant insert on table "public"."purchase_order_item_allocations" to "anon";

grant references on table "public"."purchase_order_item_allocations" to "anon";

grant select on table "public"."purchase_order_item_allocations" to "anon";

grant trigger on table "public"."purchase_order_item_allocations" to "anon";

grant truncate on table "public"."purchase_order_item_allocations" to "anon";

grant update on table "public"."purchase_order_item_allocations" to "anon";

grant delete on table "public"."purchase_order_item_allocations" to "authenticated";

grant insert on table "public"."purchase_order_item_allocations" to "authenticated";

grant references on table "public"."purchase_order_item_allocations" to "authenticated";

grant select on table "public"."purchase_order_item_allocations" to "authenticated";

grant trigger on table "public"."purchase_order_item_allocations" to "authenticated";

grant truncate on table "public"."purchase_order_item_allocations" to "authenticated";

grant update on table "public"."purchase_order_item_allocations" to "authenticated";

grant delete on table "public"."purchase_order_item_allocations" to "service_role";

grant insert on table "public"."purchase_order_item_allocations" to "service_role";

grant references on table "public"."purchase_order_item_allocations" to "service_role";

grant select on table "public"."purchase_order_item_allocations" to "service_role";

grant trigger on table "public"."purchase_order_item_allocations" to "service_role";

grant truncate on table "public"."purchase_order_item_allocations" to "service_role";

grant update on table "public"."purchase_order_item_allocations" to "service_role";

grant delete on table "public"."purchase_order_items" to "anon";

grant insert on table "public"."purchase_order_items" to "anon";

grant references on table "public"."purchase_order_items" to "anon";

grant select on table "public"."purchase_order_items" to "anon";

grant trigger on table "public"."purchase_order_items" to "anon";

grant truncate on table "public"."purchase_order_items" to "anon";

grant update on table "public"."purchase_order_items" to "anon";

grant delete on table "public"."purchase_order_items" to "authenticated";

grant insert on table "public"."purchase_order_items" to "authenticated";

grant references on table "public"."purchase_order_items" to "authenticated";

grant select on table "public"."purchase_order_items" to "authenticated";

grant trigger on table "public"."purchase_order_items" to "authenticated";

grant truncate on table "public"."purchase_order_items" to "authenticated";

grant update on table "public"."purchase_order_items" to "authenticated";

grant delete on table "public"."purchase_order_items" to "service_role";

grant insert on table "public"."purchase_order_items" to "service_role";

grant references on table "public"."purchase_order_items" to "service_role";

grant select on table "public"."purchase_order_items" to "service_role";

grant trigger on table "public"."purchase_order_items" to "service_role";

grant truncate on table "public"."purchase_order_items" to "service_role";

grant update on table "public"."purchase_order_items" to "service_role";

grant delete on table "public"."purchase_orders" to "anon";

grant insert on table "public"."purchase_orders" to "anon";

grant references on table "public"."purchase_orders" to "anon";

grant select on table "public"."purchase_orders" to "anon";

grant trigger on table "public"."purchase_orders" to "anon";

grant truncate on table "public"."purchase_orders" to "anon";

grant update on table "public"."purchase_orders" to "anon";

grant delete on table "public"."purchase_orders" to "authenticated";

grant insert on table "public"."purchase_orders" to "authenticated";

grant references on table "public"."purchase_orders" to "authenticated";

grant select on table "public"."purchase_orders" to "authenticated";

grant trigger on table "public"."purchase_orders" to "authenticated";

grant truncate on table "public"."purchase_orders" to "authenticated";

grant update on table "public"."purchase_orders" to "authenticated";

grant delete on table "public"."purchase_orders" to "service_role";

grant insert on table "public"."purchase_orders" to "service_role";

grant references on table "public"."purchase_orders" to "service_role";

grant select on table "public"."purchase_orders" to "service_role";

grant trigger on table "public"."purchase_orders" to "service_role";

grant truncate on table "public"."purchase_orders" to "service_role";

grant update on table "public"."purchase_orders" to "service_role";

grant delete on table "public"."receiver_contacts" to "anon";

grant insert on table "public"."receiver_contacts" to "anon";

grant references on table "public"."receiver_contacts" to "anon";

grant select on table "public"."receiver_contacts" to "anon";

grant trigger on table "public"."receiver_contacts" to "anon";

grant truncate on table "public"."receiver_contacts" to "anon";

grant update on table "public"."receiver_contacts" to "anon";

grant delete on table "public"."receiver_contacts" to "authenticated";

grant insert on table "public"."receiver_contacts" to "authenticated";

grant references on table "public"."receiver_contacts" to "authenticated";

grant select on table "public"."receiver_contacts" to "authenticated";

grant trigger on table "public"."receiver_contacts" to "authenticated";

grant truncate on table "public"."receiver_contacts" to "authenticated";

grant update on table "public"."receiver_contacts" to "authenticated";

grant delete on table "public"."receiver_contacts" to "service_role";

grant insert on table "public"."receiver_contacts" to "service_role";

grant references on table "public"."receiver_contacts" to "service_role";

grant select on table "public"."receiver_contacts" to "service_role";

grant trigger on table "public"."receiver_contacts" to "service_role";

grant truncate on table "public"."receiver_contacts" to "service_role";

grant update on table "public"."receiver_contacts" to "service_role";

grant delete on table "public"."receiver_profiles" to "anon";

grant insert on table "public"."receiver_profiles" to "anon";

grant references on table "public"."receiver_profiles" to "anon";

grant select on table "public"."receiver_profiles" to "anon";

grant trigger on table "public"."receiver_profiles" to "anon";

grant truncate on table "public"."receiver_profiles" to "anon";

grant update on table "public"."receiver_profiles" to "anon";

grant delete on table "public"."receiver_profiles" to "authenticated";

grant insert on table "public"."receiver_profiles" to "authenticated";

grant references on table "public"."receiver_profiles" to "authenticated";

grant select on table "public"."receiver_profiles" to "authenticated";

grant trigger on table "public"."receiver_profiles" to "authenticated";

grant truncate on table "public"."receiver_profiles" to "authenticated";

grant update on table "public"."receiver_profiles" to "authenticated";

grant delete on table "public"."receiver_profiles" to "service_role";

grant insert on table "public"."receiver_profiles" to "service_role";

grant references on table "public"."receiver_profiles" to "service_role";

grant select on table "public"."receiver_profiles" to "service_role";

grant trigger on table "public"."receiver_profiles" to "service_role";

grant truncate on table "public"."receiver_profiles" to "service_role";

grant update on table "public"."receiver_profiles" to "service_role";

grant delete on table "public"."staff_profiles" to "anon";

grant insert on table "public"."staff_profiles" to "anon";

grant references on table "public"."staff_profiles" to "anon";

grant select on table "public"."staff_profiles" to "anon";

grant trigger on table "public"."staff_profiles" to "anon";

grant truncate on table "public"."staff_profiles" to "anon";

grant update on table "public"."staff_profiles" to "anon";

grant delete on table "public"."staff_profiles" to "authenticated";

grant insert on table "public"."staff_profiles" to "authenticated";

grant references on table "public"."staff_profiles" to "authenticated";

grant select on table "public"."staff_profiles" to "authenticated";

grant trigger on table "public"."staff_profiles" to "authenticated";

grant truncate on table "public"."staff_profiles" to "authenticated";

grant update on table "public"."staff_profiles" to "authenticated";

grant delete on table "public"."staff_profiles" to "service_role";

grant insert on table "public"."staff_profiles" to "service_role";

grant references on table "public"."staff_profiles" to "service_role";

grant select on table "public"."staff_profiles" to "service_role";

grant trigger on table "public"."staff_profiles" to "service_role";

grant truncate on table "public"."staff_profiles" to "service_role";

grant update on table "public"."staff_profiles" to "service_role";


  create policy "Audit logs cannot be deleted"
  on "public"."audit_logs"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "Audit logs cannot be updated"
  on "public"."audit_logs"
  as permissive
  for update
  to authenticated
using (false);



  create policy "Staff can insert audit logs"
  on "public"."audit_logs"
  as permissive
  for insert
  to authenticated
with check (((performed_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))));



  create policy "Staff can view audit logs"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true)))));



  create policy "Admins can create delivery locations"
  on "public"."delivery_locations"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Admins can delete delivery locations"
  on "public"."delivery_locations"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Admins can update delivery locations"
  on "public"."delivery_locations"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Authenticated users can view delivery locations"
  on "public"."delivery_locations"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can read all driver locations"
  on "public"."driver_locations"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Drivers can upsert their own location"
  on "public"."driver_locations"
  as permissive
  for all
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can delete their own push tokens"
  on "public"."driver_push_tokens"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own push tokens"
  on "public"."driver_push_tokens"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own push tokens"
  on "public"."driver_push_tokens"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own push tokens"
  on "public"."driver_push_tokens"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "email_templates_read_staff"
  on "public"."email_templates"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active))));



  create policy "email_templates_update_admin"
  on "public"."email_templates"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND (sp.role = 'admin'::public.staff_role) AND sp.is_active))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND (sp.role = 'admin'::public.staff_role) AND sp.is_active))));



  create policy "Authenticated users can view inventory"
  on "public"."inventory_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Staff can delete inventory"
  on "public"."inventory_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "Staff can insert inventory"
  on "public"."inventory_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Staff can update inventory"
  on "public"."inventory_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Authenticated users can insert inventory movements"
  on "public"."inventory_movements"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Authenticated users can view inventory movements"
  on "public"."inventory_movements"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can create catalog items"
  on "public"."package_item_catalog"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Admins can delete catalog items"
  on "public"."package_item_catalog"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Admins can update catalog items"
  on "public"."package_item_catalog"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Authenticated users can view catalog items"
  on "public"."package_item_catalog"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can delete package items"
  on "public"."package_items"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Authenticated users can view package items"
  on "public"."package_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Warehouse and admins can create package items"
  on "public"."package_items"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])) AND (staff_profiles.is_active = true)))));



  create policy "Warehouse and admins can update package items"
  on "public"."package_items"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])) AND (staff_profiles.is_active = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])) AND (staff_profiles.is_active = true)))));



  create policy "package_status_history_select"
  on "public"."package_status_history"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Authenticated users can view packages"
  on "public"."packages"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Block mutations on soft-deleted packages"
  on "public"."packages"
  as restrictive
  for update
  to authenticated
using (((deleted_at IS NULL) OR ((auth.jwt() ->> 'email'::text) = ANY (ARRAY['rendani@email.com'::text]))));



  create policy "Collection staff can complete collection"
  on "public"."packages"
  as permissive
  for update
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'collection'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = ANY (ARRAY['pending'::public.package_status, 'notified'::public.package_status, 'ready_for_collection'::public.package_status]))))
with check (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'collection'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = 'collected'::public.package_status)));



  create policy "Collection staff can receive packages"
  on "public"."packages"
  as permissive
  for update
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'collection'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = 'in_transit'::public.package_status)))
with check (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'collection'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = 'ready_for_collection'::public.package_status)));



  create policy "Collection staff can view packages"
  on "public"."packages"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'collection'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Controlled package creation"
  on "public"."packages"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])) AND (staff_profiles.is_active = true)))));



  create policy "Controlled package update"
  on "public"."packages"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role, 'driver'::public.staff_role])) AND (staff_profiles.is_active = true)))))
with check ((NOT (EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.package_id = packages.id) AND (pods.is_locked = true))))));



  create policy "Drivers can pickup packages"
  on "public"."packages"
  as permissive
  for update
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'driver'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = ANY (ARRAY['pending'::public.package_status, 'notified'::public.package_status]))))
with check (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'driver'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (status = 'in_transit'::public.package_status)));



  create policy "Drivers can view packages"
  on "public"."packages"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'driver'::public.staff_role) AND (staff_profiles.is_active = true)))));



  create policy "Hide soft-deleted packages from non-privileged users"
  on "public"."packages"
  as restrictive
  for select
  to authenticated
using (((deleted_at IS NULL) OR ((auth.jwt() ->> 'email'::text) = ANY (ARRAY['rendani@email.com'::text]))));



  create policy "No direct package deletion"
  on "public"."packages"
  as permissive
  for delete
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role) AND (staff_profiles.is_active = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.package_id = packages.id) AND (pods.is_locked = true)))))));



  create policy "Staff can read PODs"
  on "public"."pods"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND (sp.role = ANY (ARRAY['admin'::public.staff_role, 'collection'::public.staff_role, 'warehouse'::public.staff_role, 'driver'::public.staff_role]))))));



  create policy "pods_insert"
  on "public"."pods"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "pods_select"
  on "public"."pods"
  as permissive
  for select
  to authenticated
using (true);



  create policy "pods_update"
  on "public"."pods"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "staff_or_owner_can_select_pods"
  on "public"."pods"
  as permissive
  for select
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND (sp.role = ANY (ARRAY['admin'::public.staff_role, 'collection'::public.staff_role, 'warehouse'::public.staff_role, 'driver'::public.staff_role])) AND (sp.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM public.packages p
  WHERE ((p.id = pods.package_id) AND (p.created_by = auth.uid()))))));



  create policy "purchase_order_item_allocations_mutate_warehouse_admin"
  on "public"."purchase_order_item_allocations"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))));



  create policy "purchase_order_item_allocations_select_authenticated"
  on "public"."purchase_order_item_allocations"
  as permissive
  for select
  to authenticated
using (true);



  create policy "purchase_order_item_allocations_service_role_all"
  on "public"."purchase_order_item_allocations"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "purchase_order_items_mutate_warehouse_admin"
  on "public"."purchase_order_items"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))));



  create policy "purchase_order_items_select_authenticated"
  on "public"."purchase_order_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "purchase_order_items_service_role_all"
  on "public"."purchase_order_items"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "purchase_orders_mutate_warehouse_admin"
  on "public"."purchase_orders"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.user_id = auth.uid()) AND sp.is_active AND (sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role]))))));



  create policy "purchase_orders_select_authenticated"
  on "public"."purchase_orders"
  as permissive
  for select
  to authenticated
using (true);



  create policy "purchase_orders_service_role_all"
  on "public"."purchase_orders"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "receiver_contacts_delete"
  on "public"."receiver_contacts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "receiver_contacts_insert"
  on "public"."receiver_contacts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "receiver_contacts_select"
  on "public"."receiver_contacts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "receiver_contacts_update"
  on "public"."receiver_contacts"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Admins can create receiver profiles"
  on "public"."receiver_profiles"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Admins can delete receiver profiles"
  on "public"."receiver_profiles"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Admins can update receiver profiles"
  on "public"."receiver_profiles"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles
  WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.role = 'admin'::public.staff_role)))));



  create policy "Authenticated users can view receiver profiles"
  on "public"."receiver_profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can create staff profiles"
  on "public"."staff_profiles"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles staff_profiles_1
  WHERE ((staff_profiles_1.user_id = auth.uid()) AND (staff_profiles_1.role = 'admin'::public.staff_role)))));



  create policy "Admins can delete staff profiles"
  on "public"."staff_profiles"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles staff_profiles_1
  WHERE ((staff_profiles_1.user_id = auth.uid()) AND (staff_profiles_1.role = 'admin'::public.staff_role)))));



  create policy "Admins can update staff profiles"
  on "public"."staff_profiles"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.staff_profiles staff_profiles_1
  WHERE ((staff_profiles_1.user_id = auth.uid()) AND (staff_profiles_1.role = 'admin'::public.staff_role)))))
with check ((EXISTS ( SELECT 1
   FROM public.staff_profiles staff_profiles_1
  WHERE ((staff_profiles_1.user_id = auth.uid()) AND (staff_profiles_1.role = 'admin'::public.staff_role)))));



  create policy "Authenticated users can view staff profiles"
  on "public"."staff_profiles"
  as permissive
  for select
  to authenticated
using (true);


CREATE TRIGGER trigger_update_delivery_locations_updated_at BEFORE UPDATE ON public.delivery_locations FOR EACH ROW EXECUTE FUNCTION public.update_delivery_locations_updated_at();

CREATE TRIGGER email_templates_bump_version BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.bump_email_template_version();

CREATE TRIGGER inventory_items_set_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER package_item_catalog_updated_at BEFORE UPDATE ON public.package_item_catalog FOR EACH ROW EXECUTE FUNCTION public.update_package_item_catalog_updated_at();

CREATE TRIGGER trg_package_status_history AFTER INSERT OR UPDATE OF status ON public.packages FOR EACH ROW EXECUTE FUNCTION public.record_package_status_change();

CREATE TRIGGER trigger_audit_packages_changes AFTER INSERT OR DELETE OR UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER trigger_prevent_package_deletion_when_locked BEFORE DELETE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.prevent_package_deletion_when_locked();

CREATE TRIGGER trigger_prevent_package_modification_when_locked BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.prevent_package_modification_when_locked();

CREATE TRIGGER trigger_set_package_reference BEFORE INSERT ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_package_reference();

CREATE TRIGGER trigger_update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_packages_updated_at();

CREATE TRIGGER trigger_audit_pod_changes AFTER UPDATE ON public.pods FOR EACH ROW EXECUTE FUNCTION public.audit_pod_changes();

CREATE TRIGGER trigger_audit_pods_insert AFTER INSERT ON public.pods FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER trigger_prevent_pod_deletion BEFORE DELETE ON public.pods FOR EACH ROW EXECUTE FUNCTION public.prevent_pod_deletion();

CREATE TRIGGER trigger_prevent_pod_modification BEFORE UPDATE ON public.pods FOR EACH ROW EXECUTE FUNCTION public.prevent_pod_modification();

CREATE TRIGGER trg_receiver_contacts_updated_at BEFORE UPDATE ON public.receiver_contacts FOR EACH ROW EXECUTE FUNCTION public.set_receiver_contacts_updated_at();

CREATE TRIGGER update_receiver_profiles_updated_at BEFORE UPDATE ON public.receiver_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_audit_staff_profiles_changes AFTER INSERT OR DELETE OR UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_table_changes();

CREATE TRIGGER update_staff_profiles_updated_at BEFORE UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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



