-- Inventory Management API Database Schema
-- PostgreSQL database schema for the inventory management system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Locations table (warehouses, stores, bins, etc.)
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'warehouse',
    parent_id UUID REFERENCES locations(id),
    address JSONB,
    capacity INTEGER,
    capacity_used INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    UNIQUE(organization_id, code)
);

-- Items table (products, materials, SKUs)
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'piece',
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    unit_price DECIMAL(12, 4),
    reorder_point INTEGER DEFAULT 0,
    reorder_quantity INTEGER DEFAULT 0,
    lead_time_days INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_serialized BOOLEAN DEFAULT false,
    is_batch_tracked BOOLEAN DEFAULT false,
    barcode VARCHAR(100),
    image_url VARCHAR(500),
    weight DECIMAL(10, 4),
    dimensions JSONB,
    metadata JSONB DEFAULT '{}',
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    UNIQUE(organization_id, sku)
);

-- Item variants (size, color variations)
CREATE TABLE item_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id),
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '[]',
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    unit_price DECIMAL(12, 4),
    barcode VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- Item attributes definitions
CREATE TABLE item_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'string',
    values JSONB,
    is_required BOOLEAN DEFAULT false,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    UNIQUE(organization_id, code)
);

-- ============================================================
-- STOCK TABLES
-- ============================================================

-- Stock table (inventory levels per item/location)
CREATE TABLE stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'piece',
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    last_count_date TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    UNIQUE(item_id, location_id)
);

-- Serialized stock (individual serial numbers)
CREATE TABLE serialized_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID NOT NULL REFERENCES stock(id),
    item_id UUID NOT NULL REFERENCES items(id),
    serial_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    location_id UUID NOT NULL REFERENCES locations(id),
    received_date DATE NOT NULL,
    expiry_date DATE,
    warranty_expiry DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    UNIQUE(item_id, serial_number)
);

-- Batch/lot stock
CREATE TABLE batch_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID NOT NULL REFERENCES stock(id),
    item_id UUID NOT NULL REFERENCES items(id),
    batch_number VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    manufacturing_date DATE,
    expiry_date DATE,
    location_id UUID NOT NULL REFERENCES locations(id),
    supplier_id UUID,
    cost_per_unit DECIMAL(12, 4) NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    UNIQUE(item_id, location_id, batch_number)
);

-- ============================================================
-- MOVEMENT TABLES
-- ============================================================

-- Stock movements
CREATE TABLE movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(30) NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_value DECIMAL(14, 4) NOT NULL DEFAULT 0,
    reference_type VARCHAR(30),
    reference_id UUID,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- Movement lines (for batch movements)
CREATE TABLE movement_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movement_id UUID NOT NULL REFERENCES movements(id),
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
    batch_number VARCHAR(50),
    serial_numbers JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL
);

-- ============================================================
-- ALERTS TABLES
-- ============================================================

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    item_id UUID REFERENCES items(id),
    location_id UUID REFERENCES locations(id),
    threshold INTEGER,
    current_value INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- Threshold rules for automated alerts
CREATE TABLE threshold_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    item_id UUID REFERENCES items(id),
    category VARCHAR(100),
    location_id UUID REFERENCES locations(id),
    threshold_type VARCHAR(30) NOT NULL,
    threshold_value INTEGER NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    is_active BOOLEAN DEFAULT true,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- ============================================================
-- PURCHASING TABLES
-- ============================================================

-- Suppliers
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    address JSONB,
    payment_terms VARCHAR(100),
    lead_time_days INTEGER DEFAULT 7,
    minimum_order_value DECIMAL(12, 2),
    rating DECIMAL(3, 2),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    UNIQUE(organization_id, code)
);

-- Purchase orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(30) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    order_date TIMESTAMP WITH TIME ZONE NOT NULL,
    expected_delivery_date TIMESTAMP WITH TIME ZONE,
    delivered_date TIMESTAMP WITH TIME ZONE,
    subtotal DECIMAL(14, 4) NOT NULL DEFAULT 0,
    tax DECIMAL(14, 4) NOT NULL DEFAULT 0,
    shipping DECIMAL(14, 4) NOT NULL DEFAULT 0,
    total DECIMAL(14, 4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    notes TEXT,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    UNIQUE(organization_id, order_number)
);

-- Purchase order lines
CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 4) NOT NULL,
    total_cost DECIMAL(14, 4) NOT NULL,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    location_id UUID REFERENCES locations(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- Restock rules for automated purchasing
CREATE TABLE restock_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    reorder_point INTEGER NOT NULL,
    reorder_quantity INTEGER NOT NULL,
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1,
    lead_time_days INTEGER,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL,
    UNIQUE(item_id, supplier_id)
);

-- ============================================================
-- USAGE TABLES
-- ============================================================

-- Usage records
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    quantity INTEGER NOT NULL,
    usage_type VARCHAR(30) NOT NULL,
    reference_type VARCHAR(30),
    reference_id VARCHAR(100),
    used_by VARCHAR(100),
    used_at TIMESTAMP WITH TIME ZONE NOT NULL,
    notes TEXT,
    cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
    organization_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID NOT NULL
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

-- Audit logs for all mutations
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module VARCHAR(30) NOT NULL,
    action VARCHAR(30) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    user_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL,
    changes JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Items indexes
CREATE INDEX idx_items_organization ON items(organization_id);
CREATE INDEX idx_items_category ON items(organization_id, category);
CREATE INDEX idx_items_sku ON items(organization_id, sku);
CREATE INDEX idx_items_active ON items(organization_id, is_active) WHERE deleted_at IS NULL;

-- Stock indexes
CREATE INDEX idx_stock_item ON stock(item_id);
CREATE INDEX idx_stock_location ON stock(location_id);
CREATE INDEX idx_stock_organization ON stock(organization_id);
CREATE INDEX idx_stock_available ON stock(item_id, available_quantity);

-- Serialized stock indexes
CREATE INDEX idx_serialized_stock_item ON serialized_stock(item_id);
CREATE INDEX idx_serialized_serial ON serialized_stock(serial_number);
CREATE INDEX idx_serialized_expiry ON serialized_stock(expiry_date) WHERE expiry_date IS NOT NULL;

-- Batch stock indexes
CREATE INDEX idx_batch_stock_item ON batch_stock(item_id);
CREATE INDEX idx_batch_batch_number ON batch_stock(batch_number);
CREATE INDEX idx_batch_expiry ON batch_stock(expiry_date) WHERE expiry_date IS NOT NULL;

-- Movements indexes
CREATE INDEX idx_movements_organization ON movements(organization_id);
CREATE INDEX idx_movements_item ON movements(item_id);
CREATE INDEX idx_movements_type ON movements(organization_id, type);
CREATE INDEX idx_movements_status ON movements(organization_id, status);
CREATE INDEX idx_movements_created ON movements(organization_id, created_at);

-- Alerts indexes
CREATE INDEX idx_alerts_organization ON alerts(organization_id);
CREATE INDEX idx_alerts_status ON alerts(organization_id, status);
CREATE INDEX idx_alerts_severity ON alerts(organization_id, severity, status);
CREATE INDEX idx_alerts_item ON alerts(item_id) WHERE item_id IS NOT NULL;

-- Purchase orders indexes
CREATE INDEX idx_po_organization ON purchase_orders(organization_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(organization_id, status);

-- Usage indexes
CREATE INDEX idx_usage_organization ON usage_records(organization_id);
CREATE INDEX idx_usage_item ON usage_records(item_id);
CREATE INDEX idx_usage_date ON usage_records(organization_id, used_at);
CREATE INDEX idx_usage_type ON usage_records(organization_id, usage_type);

-- Audit log indexes
CREATE INDEX idx_audit_organization ON audit_logs(organization_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(organization_id, timestamp);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update available_quantity trigger
CREATE OR REPLACE FUNCTION update_available_quantity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.available_quantity := NEW.quantity - NEW.reserved_quantity;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_available_quantity_trigger
    BEFORE INSERT OR UPDATE ON stock
    FOR EACH ROW
    EXECUTE FUNCTION update_available_quantity();

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER stock_updated_at BEFORE UPDATE ON stock FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER movements_updated_at BEFORE UPDATE ON movements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

