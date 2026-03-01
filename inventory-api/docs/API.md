# Inventory Management API Documentation

## Base URL
```
https://your-domain.com/api/v1
```

## Authentication

All endpoints (except `/health`) require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-15T10:30:00.000Z",
    "requestId": "uuid-string"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 100,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "timestamp": "2026-02-15T10:30:00.000Z",
    "requestId": "uuid-string"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of the error",
    "details": { ... }
  },
  "requestId": "uuid-string"
}
```

---

## Stock Tracking

### GET /stock
Retrieves all stock records with optional filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |
| itemId | uuid | Filter by item ID |
| locationId | uuid | Filter by location ID |
| status | string | Filter by status (available, reserved, in_transit, damaged, expired, quarantine) |
| lowStock | boolean | Filter items below reorder point |
| expiringSoon | boolean | Filter items expiring soon |
| expiringWithinDays | number | Days until expiry to consider |

**Response:** Paginated list of stock records with item and location details.

---

### GET /stock/:itemId
Retrieves stock levels for a specific item across all locations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "itemId": "uuid",
      "locationId": "uuid",
      "quantity": 100,
      "reservedQuantity": 10,
      "availableQuantity": 90,
      "item": { "id": "uuid", "sku": "WIDGET-001", "name": "Widget" },
      "location": { "id": "uuid", "name": "Main Warehouse", "code": "WH-MAIN" }
    }
  ]
}
```

---

### GET /stock/location/:locationId
Retrieves all stock at a specific location.

**Query Parameters:** Standard pagination parameters.

---

### POST /stock/serial
Creates serialized stock entries with individual serial numbers.

**Request Body:**
```json
{
  "itemId": "uuid",
  "locationId": "uuid",
  "serialNumbers": ["SN001", "SN002", "SN003"],
  "receivedDate": "2026-02-15",
  "expiryDate": "2027-02-15",
  "warrantyExpiry": "2028-02-15",
  "metadata": {}
}
```

---

### POST /stock/batch
Creates batch/lot tracked stock entry.

**Request Body:**
```json
{
  "itemId": "uuid",
  "locationId": "uuid",
  "batchNumber": "BATCH-2026-001",
  "quantity": 100,
  "manufacturingDate": "2026-01-15",
  "expiryDate": "2027-01-15",
  "supplierId": "uuid",
  "costPerUnit": 10.50,
  "metadata": {}
}
```

---

### PATCH /stock/expiry
Updates expiry date for stock items.

**Request Body:**
```json
{
  "stockId": "uuid",
  "batchNumber": "BATCH-2026-001",
  "newExpiryDate": "2027-06-15",
  "reason": "Extended shelf life verified by quality control"
}
```

---

## Item Management

### POST /items
Creates a new item in the catalog.

**Request Body:**
```json
{
  "sku": "WIDGET-003",
  "name": "Advanced Widget",
  "description": "An advanced widget with extra features",
  "category": "Widgets",
  "subcategory": "Premium",
  "unitOfMeasure": "piece",
  "unitCost": 15.00,
  "unitPrice": 35.00,
  "reorderPoint": 25,
  "reorderQuantity": 50,
  "leadTimeDays": 7,
  "isSerialized": false,
  "isBatchTracked": true,
  "barcode": "1234567890123",
  "weight": 0.5,
  "dimensions": { "length": 10, "width": 5, "height": 3, "unit": "cm" },
  "metadata": {}
}
```

---

### GET /items
Retrieves all items with optional filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| search | string | Search by name, SKU, or description |
| category | string | Filter by category |
| subcategory | string | Filter by subcategory |
| isActive | boolean | Filter by active status |
| isSerialized | boolean | Filter serialized items |
| isBatchTracked | boolean | Filter batch-tracked items |
| lowStock | boolean | Filter items with low stock |

---

### GET /items/:id
Retrieves a single item by ID.

---

### PATCH /items/:id
Updates an existing item.

**Request Body:** Any fields from POST /items (all optional)

---

### POST /items/:id/variants
Creates a variant for an existing item.

**Request Body:**
```json
{
  "sku": "WIDGET-003-RED-L",
  "name": "Advanced Widget - Red, Large",
  "attributes": [
    { "attributeId": "uuid", "value": "Red" },
    { "attributeId": "uuid", "value": "Large" }
  ],
  "unitCost": 16.00,
  "unitPrice": 38.00,
  "barcode": "1234567890124"
}
```

---

### POST /attributes
Creates a new attribute definition.

**Request Body:**
```json
{
  "name": "Color",
  "code": "color",
  "dataType": "string",
  "values": ["Red", "Blue", "Green", "Black", "White"],
  "isRequired": false
}
```

---

## Stock Movements

### POST /movements
Creates a new stock movement.

**Request Body:**
```json
{
  "type": "receipt",
  "itemId": "uuid",
  "toLocationId": "uuid",
  "quantity": 100,
  "unitCost": 10.00,
  "referenceType": "purchase_order",
  "referenceId": "uuid",
  "notes": "Received from supplier",
  "batchNumber": "BATCH-2026-002"
}
```

**Movement Types:** receipt, transfer, adjustment, sale, return, write_off, production

---

### POST /movements/transfer
Creates a transfer between locations.

**Request Body:**
```json
{
  "items": [
    { "itemId": "uuid", "quantity": 50, "batchNumber": "BATCH-001" },
    { "itemId": "uuid", "quantity": 25 }
  ],
  "fromLocationId": "uuid",
  "toLocationId": "uuid",
  "notes": "Transfer to retail store"
}
```

---

### POST /movements/adjustment
Creates a stock adjustment.

**Request Body:**
```json
{
  "itemId": "uuid",
  "locationId": "uuid",
  "adjustmentType": "decrease",
  "quantity": 5,
  "reason": "damaged",
  "notes": "Items damaged during handling, removed from inventory"
}
```

**Adjustment Types:** increase, decrease, set
**Reasons:** cycle_count, damaged, expired, lost, found, theft, correction, other

---

### GET /movements/history
Retrieves movement history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| itemId | uuid | Filter by item |
| locationId | uuid | Filter by location |
| type | string | Filter by movement type |
| status | string | Filter by status |
| startDate | date | Start of date range |
| endDate | date | End of date range |
| referenceType | string | Filter by reference type |
| referenceId | uuid | Filter by reference ID |

---

## Alerts

### GET /alerts
Retrieves all alerts.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | Filter by alert type |
| severity | string | Filter by severity (low, medium, high, critical) |
| status | string | Filter by status (active, acknowledged, resolved, dismissed) |
| itemId | uuid | Filter by item |
| locationId | uuid | Filter by location |

---

### POST /alerts/threshold
Creates a new threshold rule for automated alerts.

**Request Body:**
```json
{
  "name": "Low Stock Alert - Electronics",
  "description": "Alert when electronics stock falls below threshold",
  "category": "Electronics",
  "thresholdType": "min_quantity",
  "thresholdValue": 10,
  "severity": "high"
}
```

**Threshold Types:** min_quantity, max_quantity, expiry_days, reorder_point

---

### PATCH /alerts/:id
Updates an alert's status.

**Request Body:**
```json
{
  "status": "acknowledged",
  "notes": "Reviewing stock levels"
}
```

---

## Reports

### GET /reports/valuation
Generates inventory valuation report.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| asOfDate | date | Valuation date (default: today) |
| includeZeroStock | boolean | Include items with zero stock |
| categories | string | Comma-separated category filters |
| locations | string | Comma-separated location filters |

---

### GET /reports/movement
Generates movement report.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| startDate | date | Required: Start of date range |
| endDate | date | Required: End of date range |
| itemIds | string | Comma-separated item IDs |
| locationIds | string | Comma-separated location IDs |
| movementTypes | string | Comma-separated movement types |

---

### GET /reports/turnover
Generates inventory turnover report.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| startDate | date | Required: Start of date range |
| endDate | date | Required: End of date range |
| categories | string | Comma-separated category filters |
| minTurnoverRate | number | Minimum turnover rate filter |
| maxTurnoverRate | number | Maximum turnover rate filter |

---

## Purchasing

### POST /suppliers
Creates a new supplier.

**Request Body:**
```json
{
  "code": "SUP-004",
  "name": "Quality Parts Co",
  "contactName": "Alice Johnson",
  "email": "alice@qualityparts.com",
  "phone": "+1-555-0400",
  "address": {
    "street": "123 Industrial Way",
    "city": "Manufacturing City",
    "state": "CA",
    "postalCode": "90210",
    "country": "USA"
  },
  "paymentTerms": "Net 30",
  "leadTimeDays": 5,
  "minimumOrderValue": 100.00
}
```

---

### GET /suppliers
Retrieves all suppliers.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search by name or code |
| isActive | boolean | Filter by active status |

---

### POST /purchase-orders
Creates a new purchase order.

**Request Body:**
```json
{
  "supplierId": "uuid",
  "expectedDeliveryDate": "2026-02-28",
  "lines": [
    { "itemId": "uuid", "quantity": 100, "unitCost": 10.00, "locationId": "uuid" },
    { "itemId": "uuid", "quantity": 50, "unitCost": 15.00 }
  ],
  "notes": "Urgent restock order"
}
```

---

### PATCH /purchase-orders/:id/status
Updates a purchase order's status.

**Request Body:**
```json
{
  "status": "approved",
  "notes": "Approved by manager"
}
```

**Statuses:** draft, pending, approved, ordered, partially_received, received, cancelled

---

### POST /restock-rules
Creates a restock rule for automated purchasing.

**Request Body:**
```json
{
  "itemId": "uuid",
  "supplierId": "uuid",
  "reorderPoint": 50,
  "reorderQuantity": 100,
  "minimumOrderQuantity": 25,
  "leadTimeDays": 7
}
```

---

## Usage Integration

### POST /usage
Records usage of inventory items.

**Request Body:**
```json
{
  "itemId": "uuid",
  "locationId": "uuid",
  "quantity": 5,
  "usageType": "consumption",
  "referenceType": "work_order",
  "referenceId": "WO-2026-001",
  "usedBy": "John Smith",
  "usedAt": "2026-02-15T10:30:00Z",
  "notes": "Used for maintenance project"
}
```

**Usage Types:** consumption, production, maintenance, sample, testing, waste, other
**Reference Types:** work_order, project, department, customer, asset

---

### GET /usage/history
Retrieves usage history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| itemId | uuid | Filter by item |
| locationId | uuid | Filter by location |
| usageType | string | Filter by usage type |
| referenceType | string | Filter by reference type |
| referenceId | string | Filter by reference ID |
| usedBy | string | Filter by user |
| startDate | date | Start of date range |
| endDate | date | End of date range |

---

## Error Codes

| Code | Description |
|------|-------------|
| VALIDATION_ERROR | Request validation failed |
| UNAUTHORIZED | Authentication required |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Resource not found |
| CONFLICT | Resource already exists |
| INSUFFICIENT_STOCK | Not enough stock available |
| INVALID_INPUT | Invalid input data |
| INTERNAL_ERROR | Server error |

---

## Rate Limiting

API requests are rate limited to 100 requests per minute per user. When exceeded, the API returns HTTP 429 with a `Retry-After` header.

---

## Webhooks (Coming Soon)

Webhook support for real-time notifications on:
- Stock level changes
- Threshold alerts
- Purchase order status changes
- Movement completions

