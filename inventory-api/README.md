# Inventory Management API

A production-ready Edge Functions API for inventory management built with TypeScript, following clean architecture principles.

## Folder Structure

```
inventory-api/
├── .env.example                    # Environment template
├── deno.json                       # Deno configuration
├── README.md                       # This file
├── database/
│   ├── schema.sql                  # PostgreSQL schema
│   └── seed.sql                    # Sample seed data
├── docs/
│   └── API.md                      # Complete API documentation
└── src/
    ├── index.ts                    # Main entry point
    ├── router.ts                   # Route definitions & middleware
    ├── config/
    │   └── database.ts             # Database configuration
    ├── core/
    │   ├── errors/
    │   │   └── index.ts            # Custom error classes
    │   ├── middleware/
    │   │   ├── auth.ts             # JWT authentication
    │   │   ├── rbac.ts             # Role-based authorization
    │   │   ├── error-handler.ts    # Global error handling
    │   │   └── logger.ts           # Request/mutation logging
    │   ├── types/
    │   │   ├── index.ts            # Common types
    │   │   ├── request.ts          # Request context types
    │   │   └── response.ts         # API response types
    │   └── utils/
    │       ├── audit.ts            # Audit logging utility
    │       ├── response.ts         # Standardized API responses
    │       └── validation.ts       # Zod validation helpers
    ├── database/
    │   ├── client.ts               # Database client
    │   └── queries.ts              # Base query utilities
    └── features/
        ├── alerts/                 # Inventory alerts
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   ├── types.ts
        │   └── validation.ts
        ├── items/                  # Item management
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   ├── types.ts
        │   └── validation.ts
        ├── movements/              # Stock movements
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   ├── types.ts
        │   └── validation.ts
        ├── purchasing/             # Suppliers & POs
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   ├── types.ts
        │   └── validation.ts
        ├── reports/                # Reporting
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   └── types.ts
        ├── stock/                  # Stock tracking
        │   ├── repository.ts
        │   ├── routes.ts
        │   ├── service.ts
        │   ├── types.ts
        │   └── validation.ts
        └── usage/                  # Usage integration
            ├── repository.ts
            ├── routes.ts
            ├── service.ts
            ├── types.ts
            └── validation.ts
```

## Features

- **Stock Tracking**: Track inventory levels by item, location, serial numbers, and batches
- **Item Management**: CRUD operations for items with variant and attribute support
- **Stock Movements**: Transfers, adjustments, and movement history
- **Alerts**: Threshold-based inventory alerts
- **Reports**: Valuation, movement, and turnover reports
- **Purchasing**: Supplier and purchase order management
- **Usage Integration**: Track and report inventory usage

## Tech Stack

- Runtime: Deno Edge Functions (Deno Deploy, Vercel Edge, **Supabase Edge Functions**)
- Database: PostgreSQL (Supabase)
- Validation: Zod
- Auth: JWT-based with role-based access control

## Deployment Options

### Option 1: Supabase Edge Functions (Recommended)

The API is fully compatible with Supabase Edge Functions. See `docs/SUPABASE-DEPLOYMENT.md` for detailed instructions.

```bash
# Deploy to Supabase
supabase functions deploy inventory
```

### Option 2: Deno Deploy

```bash
# Deploy to Deno Deploy
deno run --allow-net --allow-env src/index.ts
```

### Option 3: Vercel Edge

The code can be adapted for Vercel Edge Functions with minimal changes.



