-- Supabase PostgreSQL Functions
-- These functions enable complex operations from Edge Functions
-- Run this in Supabase SQL Editor after the schema.sql

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Execute dynamic SQL (use with caution, validate inputs in Edge Function)
CREATE OR REPLACE FUNCTION execute_sql(query text, params jsonb DEFAULT '[]')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    EXECUTE query INTO result USING params;
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SQL execution error: %', SQLERRM;
END;
$$;

-- ============================================================
-- STOCK FUNCTIONS
-- ============================================================

-- Create serialized stock with multiple serial numbers (atomic)
CREATE OR REPLACE FUNCTION create_serialized_stock(
    p_item_id uuid,
    p_location_id uuid,
    p_serial_numbers text[],
    p_received_date date,
    p_expiry_date date,
    p_warranty_expiry date,
    p_metadata jsonb,
    p_organization_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock_id uuid;
    v_serial_number text;
    v_created_items jsonb := '[]'::jsonb;
    v_item_record jsonb;
BEGIN
    -- Ensure stock record exists
    SELECT id INTO v_stock_id
    FROM stock
    WHERE item_id = p_item_id
      AND location_id = p_location_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    IF v_stock_id IS NULL THEN
        INSERT INTO stock (
            id, item_id, location_id, quantity, reserved_quantity, available_quantity,
            unit_of_measure, status, organization_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), p_item_id, p_location_id, 0, 0, 0,
            'piece', 'available', p_organization_id, NOW(), p_user_id, NOW(), p_user_id
        )
        RETURNING id INTO v_stock_id;
    END IF;

    -- Create serial number records
    FOREACH v_serial_number IN ARRAY p_serial_numbers
    LOOP
        INSERT INTO serialized_stock (
            id, stock_id, item_id, serial_number, status, location_id,
            received_date, expiry_date, warranty_expiry, metadata,
            created_at, created_by
        ) VALUES (
            gen_random_uuid(), v_stock_id, p_item_id, v_serial_number, 'available', p_location_id,
            p_received_date, p_expiry_date, p_warranty_expiry, COALESCE(p_metadata, '{}'),
            NOW(), p_user_id
        )
        RETURNING jsonb_build_object(
            'id', id,
            'serialNumber', serial_number,
            'status', status
        ) INTO v_item_record;

        v_created_items := v_created_items || v_item_record;
    END LOOP;

    -- Update stock quantity
    UPDATE stock SET
        quantity = quantity + array_length(p_serial_numbers, 1),
        available_quantity = available_quantity + array_length(p_serial_numbers, 1),
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE id = v_stock_id;

    RETURN jsonb_build_object(
        'success', true,
        'stockId', v_stock_id,
        'itemsCreated', array_length(p_serial_numbers, 1),
        'items', v_created_items
    );
END;
$$;

-- Create batch stock (atomic)
CREATE OR REPLACE FUNCTION create_batch_stock(
    p_item_id uuid,
    p_location_id uuid,
    p_batch_number text,
    p_quantity integer,
    p_manufacturing_date date,
    p_expiry_date date,
    p_supplier_id uuid,
    p_cost_per_unit numeric,
    p_metadata jsonb,
    p_organization_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock_id uuid;
    v_batch_id uuid;
BEGIN
    -- Ensure stock record exists
    SELECT id INTO v_stock_id
    FROM stock
    WHERE item_id = p_item_id
      AND location_id = p_location_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    IF v_stock_id IS NULL THEN
        INSERT INTO stock (
            id, item_id, location_id, quantity, reserved_quantity, available_quantity,
            unit_of_measure, status, organization_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), p_item_id, p_location_id, 0, 0, 0,
            'piece', 'available', p_organization_id, NOW(), p_user_id, NOW(), p_user_id
        )
        RETURNING id INTO v_stock_id;
    END IF;

    -- Create batch record
    INSERT INTO batch_stock (
        id, stock_id, item_id, batch_number, quantity, status,
        manufacturing_date, expiry_date, location_id, supplier_id,
        cost_per_unit, metadata, created_at, created_by
    ) VALUES (
        gen_random_uuid(), v_stock_id, p_item_id, p_batch_number, p_quantity, 'available',
        p_manufacturing_date, p_expiry_date, p_location_id, p_supplier_id,
        p_cost_per_unit, COALESCE(p_metadata, '{}'), NOW(), p_user_id
    )
    RETURNING id INTO v_batch_id;

    -- Update stock quantity
    UPDATE stock SET
        quantity = quantity + p_quantity,
        available_quantity = available_quantity + p_quantity,
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE id = v_stock_id;

    RETURN jsonb_build_object(
        'success', true,
        'stockId', v_stock_id,
        'batchId', v_batch_id,
        'quantity', p_quantity
    );
END;
$$;

-- ============================================================
-- MOVEMENT FUNCTIONS
-- ============================================================

-- Transfer stock between locations (atomic)
CREATE OR REPLACE FUNCTION transfer_stock(
    p_items jsonb,  -- Array of {itemId, quantity, batchNumber?, serialNumbers?}
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_notes text,
    p_organization_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
    v_item_id uuid;
    v_quantity integer;
    v_available integer;
    v_movement_id uuid;
    v_movements jsonb := '[]'::jsonb;
    v_transfer_id uuid := gen_random_uuid();
BEGIN
    -- Validate all items have sufficient stock first
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'itemId')::uuid;
        v_quantity := (v_item->>'quantity')::integer;

        SELECT available_quantity INTO v_available
        FROM stock
        WHERE item_id = v_item_id
          AND location_id = p_from_location_id
          AND organization_id = p_organization_id
          AND deleted_at IS NULL;

        IF v_available IS NULL OR v_available < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for item %: requested %, available %',
                v_item_id, v_quantity, COALESCE(v_available, 0);
        END IF;
    END LOOP;

    -- Process each item transfer
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'itemId')::uuid;
        v_quantity := (v_item->>'quantity')::integer;

        -- Decrease source stock
        UPDATE stock SET
            quantity = quantity - v_quantity,
            available_quantity = available_quantity - v_quantity,
            updated_at = NOW(),
            updated_by = p_user_id
        WHERE item_id = v_item_id
          AND location_id = p_from_location_id
          AND organization_id = p_organization_id;

        -- Increase destination stock (create if not exists)
        INSERT INTO stock (
            id, item_id, location_id, quantity, reserved_quantity, available_quantity,
            unit_of_measure, status, organization_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), v_item_id, p_to_location_id, v_quantity, 0, v_quantity,
            'piece', 'available', p_organization_id, NOW(), p_user_id, NOW(), p_user_id
        )
        ON CONFLICT (item_id, location_id) DO UPDATE SET
            quantity = stock.quantity + v_quantity,
            available_quantity = stock.available_quantity + v_quantity,
            updated_at = NOW(),
            updated_by = p_user_id;

        -- Create movement record
        INSERT INTO movements (
            id, type, item_id, from_location_id, to_location_id,
            quantity, unit_cost, total_value, notes, status,
            organization_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), 'transfer', v_item_id, p_from_location_id, p_to_location_id,
            v_quantity, 0, 0, p_notes, 'completed',
            p_organization_id, NOW(), p_user_id, NOW(), p_user_id
        )
        RETURNING id INTO v_movement_id;

        v_movements := v_movements || jsonb_build_object(
            'movementId', v_movement_id,
            'itemId', v_item_id,
            'quantity', v_quantity
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'transferId', v_transfer_id,
        'movements', v_movements
    );
END;
$$;

-- Adjust stock (atomic)
CREATE OR REPLACE FUNCTION adjust_stock(
    p_item_id uuid,
    p_location_id uuid,
    p_adjustment_type text,  -- 'increase', 'decrease', 'set'
    p_quantity integer,
    p_reason text,
    p_notes text,
    p_organization_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_quantity integer;
    v_adjustment integer;
    v_movement_id uuid;
BEGIN
    -- Get current stock
    SELECT available_quantity INTO v_current_quantity
    FROM stock
    WHERE item_id = p_item_id
      AND location_id = p_location_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    IF v_current_quantity IS NULL THEN
        v_current_quantity := 0;
    END IF;

    -- Calculate adjustment
    CASE p_adjustment_type
        WHEN 'increase' THEN v_adjustment := p_quantity;
        WHEN 'decrease' THEN
            IF v_current_quantity < p_quantity THEN
                RAISE EXCEPTION 'Cannot decrease by % when only % available', p_quantity, v_current_quantity;
            END IF;
            v_adjustment := -p_quantity;
        WHEN 'set' THEN v_adjustment := p_quantity - v_current_quantity;
        ELSE RAISE EXCEPTION 'Invalid adjustment type: %', p_adjustment_type;
    END CASE;

    -- Update or create stock record
    INSERT INTO stock (
        id, item_id, location_id, quantity, reserved_quantity, available_quantity,
        unit_of_measure, status, organization_id, created_at, created_by, updated_at, updated_by
    ) VALUES (
        gen_random_uuid(), p_item_id, p_location_id,
        GREATEST(0, v_current_quantity + v_adjustment), 0, GREATEST(0, v_current_quantity + v_adjustment),
        'piece', 'available', p_organization_id, NOW(), p_user_id, NOW(), p_user_id
    )
    ON CONFLICT (item_id, location_id) DO UPDATE SET
        quantity = GREATEST(0, stock.quantity + v_adjustment),
        available_quantity = GREATEST(0, stock.available_quantity + v_adjustment),
        updated_at = NOW(),
        updated_by = p_user_id;

    -- Create movement record
    INSERT INTO movements (
        id, type, item_id,
        from_location_id, to_location_id,
        quantity, unit_cost, total_value, reference_type, notes, status,
        organization_id, created_at, created_by, updated_at, updated_by
    ) VALUES (
        gen_random_uuid(), 'adjustment', p_item_id,
        CASE WHEN v_adjustment < 0 THEN p_location_id ELSE NULL END,
        CASE WHEN v_adjustment > 0 THEN p_location_id ELSE NULL END,
        ABS(v_adjustment), 0, 0, 'adjustment', p_reason || ': ' || p_notes, 'completed',
        p_organization_id, NOW(), p_user_id, NOW(), p_user_id
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'movementId', v_movement_id,
        'previousQuantity', v_current_quantity,
        'newQuantity', v_current_quantity + v_adjustment,
        'adjustment', v_adjustment
    );
END;
$$;

-- ============================================================
-- USAGE FUNCTION
-- ============================================================

-- Record usage with stock decrement (atomic)
CREATE OR REPLACE FUNCTION record_usage(
    p_item_id uuid,
    p_location_id uuid,
    p_quantity integer,
    p_usage_type text,
    p_reference_type text,
    p_reference_id text,
    p_used_by text,
    p_used_at timestamptz,
    p_notes text,
    p_organization_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_available integer;
    v_unit_cost numeric;
    v_usage_id uuid;
BEGIN
    -- Check available stock
    SELECT available_quantity INTO v_available
    FROM stock
    WHERE item_id = p_item_id
      AND location_id = p_location_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    IF v_available IS NULL OR v_available < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock: requested %, available %',
            p_quantity, COALESCE(v_available, 0);
    END IF;

    -- Get item cost
    SELECT unit_cost INTO v_unit_cost
    FROM items
    WHERE id = p_item_id;

    -- Decrement stock
    UPDATE stock SET
        quantity = quantity - p_quantity,
        available_quantity = available_quantity - p_quantity,
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE item_id = p_item_id
      AND location_id = p_location_id
      AND organization_id = p_organization_id;

    -- Create usage record
    INSERT INTO usage_records (
        id, item_id, location_id, quantity, usage_type,
        reference_type, reference_id, used_by, used_at, notes, cost,
        organization_id, created_at, created_by, updated_at, updated_by
    ) VALUES (
        gen_random_uuid(), p_item_id, p_location_id, p_quantity, p_usage_type,
        p_reference_type, p_reference_id, p_used_by, COALESCE(p_used_at, NOW()), p_notes,
        v_unit_cost * p_quantity,
        p_organization_id, NOW(), p_user_id, NOW(), p_user_id
    )
    RETURNING id INTO v_usage_id;

    RETURN jsonb_build_object(
        'success', true,
        'usageId', v_usage_id,
        'quantity', p_quantity,
        'cost', v_unit_cost * p_quantity
    );
END;
$$;

-- ============================================================
-- REPORT FUNCTIONS
-- ============================================================

-- Get inventory valuation report
CREATE OR REPLACE FUNCTION get_valuation_report(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_summary jsonb;
    v_by_category jsonb;
    v_by_location jsonb;
BEGIN
    -- Summary
    SELECT jsonb_build_object(
        'totalItems', COUNT(DISTINCT i.id),
        'totalQuantity', COALESCE(SUM(s.quantity), 0),
        'totalValue', COALESCE(SUM(s.quantity * i.unit_cost), 0),
        'lowStockItems', COUNT(DISTINCT CASE WHEN COALESCE(s.available_quantity, 0) <= i.reorder_point AND COALESCE(s.available_quantity, 0) > 0 THEN i.id END),
        'outOfStockItems', COUNT(DISTINCT CASE WHEN COALESCE(s.available_quantity, 0) = 0 THEN i.id END)
    ) INTO v_summary
    FROM items i
    LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
    WHERE i.organization_id = p_organization_id AND i.deleted_at IS NULL AND i.is_active = true;

    -- By category
    SELECT jsonb_agg(cat_data) INTO v_by_category
    FROM (
        SELECT jsonb_build_object(
            'category', i.category,
            'itemCount', COUNT(DISTINCT i.id),
            'totalQuantity', COALESCE(SUM(s.quantity), 0),
            'totalValue', COALESCE(SUM(s.quantity * i.unit_cost), 0)
        ) as cat_data
        FROM items i
        LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
        WHERE i.organization_id = p_organization_id AND i.deleted_at IS NULL
        GROUP BY i.category
        ORDER BY SUM(s.quantity * i.unit_cost) DESC NULLS LAST
    ) sub;

    -- By location
    SELECT jsonb_agg(loc_data) INTO v_by_location
    FROM (
        SELECT jsonb_build_object(
            'locationId', l.id,
            'locationName', l.name,
            'itemCount', COUNT(DISTINCT s.item_id),
            'totalQuantity', COALESCE(SUM(s.quantity), 0),
            'totalValue', COALESCE(SUM(s.quantity * i.unit_cost), 0)
        ) as loc_data
        FROM locations l
        LEFT JOIN stock s ON l.id = s.location_id AND s.deleted_at IS NULL
        LEFT JOIN items i ON s.item_id = i.id
        WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL
        GROUP BY l.id, l.name
        ORDER BY SUM(s.quantity * i.unit_cost) DESC NULLS LAST
    ) sub;

    RETURN jsonb_build_object(
        'generatedAt', NOW(),
        'summary', v_summary,
        'byCategory', COALESCE(v_by_category, '[]'::jsonb),
        'byLocation', COALESCE(v_by_location, '[]'::jsonb)
    );
END;
$$;

-- ============================================================
-- PERMISSIONS
-- ============================================================

-- Grant execute permissions to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION execute_sql TO authenticated;
GRANT EXECUTE ON FUNCTION create_serialized_stock TO authenticated;
GRANT EXECUTE ON FUNCTION create_batch_stock TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_stock TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock TO authenticated;
GRANT EXECUTE ON FUNCTION record_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_valuation_report TO authenticated;

-- For service role (Edge Functions)
GRANT EXECUTE ON FUNCTION execute_sql TO service_role;
GRANT EXECUTE ON FUNCTION create_serialized_stock TO service_role;
GRANT EXECUTE ON FUNCTION create_batch_stock TO service_role;
GRANT EXECUTE ON FUNCTION transfer_stock TO service_role;
GRANT EXECUTE ON FUNCTION adjust_stock TO service_role;
GRANT EXECUTE ON FUNCTION record_usage TO service_role;
GRANT EXECUTE ON FUNCTION get_valuation_report TO service_role;

