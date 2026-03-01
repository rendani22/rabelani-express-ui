# Inventory Management API - Supabase Deployment Guide

This guide explains how to deploy the Inventory Management API as Supabase Edge Functions.

## Prerequisites

1. [Supabase CLI](https://supabase.com/docs/guides/cli) installed
2. A Supabase project created
3. Docker installed (for local development)

## Project Structure for Supabase

```
inventory-api/
├── supabase/
│   ├── functions/
│   │   └── inventory/          # Edge Function
│   │       ├── index.ts        # Entry point
│   │       ├── router.ts       # Route handling
│   │       ├── core/           # Shared utilities
│   │       ├── database/       # Supabase client
│   │       └── features/       # Feature modules
│   └── migrations/             # Database migrations
├── database/
│   ├── schema.sql              # PostgreSQL schema
│   ├── seed.sql                # Sample data
│   └── supabase-functions.sql  # RPC functions
└── docs/
    └── API.md                  # API documentation
```

## Setup Steps

### 1. Initialize Supabase in your project

```bash
cd inventory-api
supabase init
```

### 2. Link to your Supabase project

```bash
supabase link --project-ref your-project-ref
```

### 3. Apply database schema

Run the SQL files in Supabase SQL Editor in this order:

1. `database/schema.sql` - Creates all tables
2. `database/supabase-functions.sql` - Creates RPC functions for atomic operations
3. `database/seed.sql` (optional) - Adds sample data

Or use migrations:

```bash
# Create a migration
supabase migration new initial_schema

# Copy schema.sql content to the migration file
# Then apply:
supabase db push
```

### 4. Deploy the Edge Function

```bash
supabase functions deploy inventory
```

### 5. Set environment variables (if needed)

```bash
supabase secrets set MY_SECRET=value
```

## Local Development

### Start Supabase locally

```bash
supabase start
```

### Serve functions locally

```bash
supabase functions serve inventory --env-file .env.local
```

### Test the function

```bash
curl -X GET http://localhost:54321/functions/v1/inventory/health
```

## API Endpoints

All endpoints are prefixed with `/functions/v1/inventory`:

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /stock | List all stock |
| GET | /stock/:itemId | Get stock by item |
| POST | /stock/serial | Create serialized stock |
| POST | /stock/batch | Create batch stock |
| GET | /items | List all items |
| POST | /items | Create item |
| GET | /items/:id | Get item by ID |
| PATCH | /items/:id | Update item |
| POST | /movements | Create movement |
| POST | /movements/transfer | Transfer stock |
| GET | /movements/history | Get movement history |
| GET | /alerts | List alerts |
| POST | /alerts/threshold | Create threshold rule |
| GET | /reports/valuation | Valuation report |
| GET | /reports/movement | Movement report |
| POST | /suppliers | Create supplier |
| GET | /suppliers | List suppliers |
| POST | /purchase-orders | Create purchase order |
| POST | /usage | Record usage |
| GET | /usage/history | Usage history |

## Authentication

The API uses Supabase Auth. Include the user's JWT in the Authorization header:

```bash
curl -X GET \
  'https://your-project.supabase.co/functions/v1/inventory/stock' \
  -H 'Authorization: Bearer YOUR_SUPABASE_JWT' \
  -H 'Content-Type: application/json'
```

## User Roles & Permissions

Configure user roles in the `user_metadata`:

```sql
-- Update user metadata in Supabase Auth
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data,
  '{role}',
  '"admin"'
)
WHERE id = 'user-uuid';
```

Or set during signup:

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      role: 'manager',
      organization_id: 'org-uuid',
    }
  }
});
```

### Role Hierarchy

| Role | Permissions |
|------|-------------|
| admin | Full access to all features |
| manager | Create, read, update on all modules |
| operator | Read all, create movements and usage |
| viewer | Read-only access |

## Database Considerations

### Row Level Security (RLS)

Enable RLS on all tables for multi-tenant support:

```sql
-- Enable RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Create policy for organization isolation
CREATE POLICY "Users can only access their organization's items"
ON items
FOR ALL
USING (organization_id = auth.jwt() ->> 'organization_id');
```

### Indexes

The schema includes indexes for common queries. Add more based on your usage patterns:

```sql
-- Example: Add index for frequently filtered columns
CREATE INDEX idx_items_category_active 
ON items(organization_id, category) 
WHERE is_active = true AND deleted_at IS NULL;
```

## Monitoring & Logging

### View function logs

```bash
supabase functions logs inventory
```

### In the Supabase Dashboard

1. Go to Edge Functions
2. Select your function
3. View logs and metrics

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure your frontend domain is in the allowed origins

2. **Authentication errors**: Verify the JWT is valid and not expired

3. **Permission errors**: Check user's role and organization_id in metadata

4. **Database errors**: Check the function logs for SQL error details

### Debug Mode

For local development, add debug logging:

```typescript
console.log('Debug:', JSON.stringify(data, null, 2));
```

## Performance Tips

1. **Use RPC functions** for complex operations (transfers, adjustments)
2. **Enable connection pooling** in Supabase project settings
3. **Add indexes** for frequently queried columns
4. **Use pagination** for large datasets

## Scaling

Supabase Edge Functions automatically scale based on demand. For high-traffic scenarios:

1. Optimize database queries
2. Use caching where appropriate
3. Consider breaking into multiple smaller functions

## Security Checklist

- [ ] Enable RLS on all tables
- [ ] Use service role key only in Edge Functions
- [ ] Validate all inputs with Zod schemas
- [ ] Implement rate limiting
- [ ] Audit log all mutations
- [ ] Regular security reviews

