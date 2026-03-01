/**
 * Supabase Database Client
 * Uses Supabase JS client for database operations in Edge Functions
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Query result type compatible with our existing code
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

// Transaction interface (limited in Supabase, uses RPC for complex operations)
export interface Transaction {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Supabase Database Client
 * Wraps Supabase client to provide compatible interface with our repositories
 */
class SupabaseDatabaseClient {
  private client: SupabaseClient | null = null;

  /**
   * Initializes the Supabase client
   */
  connect(): void {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('[DB] Supabase client initialized');
  }

  /**
   * Gets the Supabase client instance
   */
  getClient(): SupabaseClient {
    if (!this.client) {
      this.connect();
    }
    return this.client!;
  }

  /**
   * Disconnects (no-op for Supabase client)
   */
  async disconnect(): Promise<void> {
    console.log('[DB] Supabase client closed');
  }

  /**
   * Executes a raw SQL query using Supabase's RPC
   * For complex queries, create a PostgreSQL function and call it via RPC
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const client = this.getClient();

    // For simple SELECT queries on a single table, we can use the query builder
    // For complex queries, we need to use RPC with a PostgreSQL function

    // Check if this is a simple table query we can optimize
    const simpleSelectMatch = sql.match(/^SELECT\s+\*\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\$1$/i);
    if (simpleSelectMatch && params.length === 1) {
      const tableName = simpleSelectMatch[1];
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .eq('id', params[0])
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        rows: data ? [data as T] : [],
        rowCount: data ? 1 : 0,
      };
    }

    // For complex queries, use the sql RPC function
    // This requires creating a function in Supabase: execute_sql(query text, params jsonb)
    const { data, error } = await client.rpc('execute_sql', {
      query: sql,
      params: JSON.stringify(params),
    });

    if (error) {
      console.error('[DB Error]', error);
      throw new Error(`Database error: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);

    return {
      rows: rows as T[],
      rowCount: rows.length,
    };
  }

  /**
   * Executes a single row query
   */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    const result = await this.query<T>(sql, params);
    return result.rows[0];
  }

  /**
   * Begins a transaction (uses Supabase RPC for transaction support)
   */
  async beginTransaction(): Promise<Transaction> {
    // Supabase Edge Functions don't support traditional transactions
    // For atomic operations, use PostgreSQL functions via RPC
    console.warn('[DB] Transactions in Edge Functions should use RPC functions for atomicity');

    return {
      query: async <T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> => {
        return await this.query<T>(sql, params);
      },
      commit: async (): Promise<void> => {
        // No-op in Supabase Edge Functions
      },
      rollback: async (): Promise<void> => {
        console.warn('[DB] Rollback not supported in Edge Functions without RPC');
      },
    };
  }

  /**
   * Executes a function within a transaction context
   * For Supabase, this should ideally call a PostgreSQL function
   */
  async withTransaction<T>(
    fn: (tx: Transaction) => Promise<T>
  ): Promise<T> {
    const tx = await this.beginTransaction();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('items').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Supabase-specific helper methods for common operations
  // These provide better performance than raw SQL in Edge Functions
  // ============================================================

  /**
   * Select from a table with filters
   */
  async select<T>(
    table: string,
    options: {
      columns?: string;
      filters?: Record<string, unknown>;
      order?: { column: string; ascending?: boolean };
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<T[]> {
    const client = this.getClient();

    let query = client
      .from(table)
      .select(options.columns || '*');

    // Apply filters
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    // Apply ordering
    if (options.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true
      });
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Select error: ${error.message}`);
    }

    return (data || []) as T[];
  }

  /**
   * Insert into a table
   */
  async insert<T>(
    table: string,
    data: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<T[]> {
    const client = this.getClient();

    const { data: result, error } = await client
      .from(table)
      .insert(data)
      .select();

    if (error) {
      throw new Error(`Insert error: ${error.message}`);
    }

    return (result || []) as T[];
  }

  /**
   * Update a table
   */
  async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T | null> {
    const client = this.getClient();

    const { data: result, error } = await client
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Update error: ${error.message}`);
    }

    return result as T;
  }

  /**
   * Delete from a table (or soft delete)
   */
  async delete(
    table: string,
    id: string,
    soft: boolean = true,
    userId?: string
  ): Promise<boolean> {
    const client = this.getClient();

    if (soft) {
      const { error } = await client
        .from(table)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userId
        })
        .eq('id', id);

      if (error) {
        throw new Error(`Soft delete error: ${error.message}`);
      }
    } else {
      const { error } = await client
        .from(table)
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Delete error: ${error.message}`);
      }
    }

    return true;
  }

  /**
   * Count rows in a table
   */
  async count(
    table: string,
    filters?: Record<string, unknown>
  ): Promise<number> {
    const client = this.getClient();

    let query = client
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      }
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Count error: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Call a PostgreSQL function via RPC
   * This is the recommended way to handle complex operations in Supabase
   */
  async rpc<T>(
    functionName: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const client = this.getClient();

    const { data, error } = await client.rpc(functionName, params);

    if (error) {
      throw new Error(`RPC error: ${error.message}`);
    }

    return data as T;
  }
}

// Export singleton instance
export const db = new SupabaseDatabaseClient();

// Also export the class for testing
export { SupabaseDatabaseClient };

