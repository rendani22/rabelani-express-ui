/**
 * Base Query Utilities
 * Provides reusable query building helpers for repositories
 */

import type { PaginationParams, PaginatedResult } from '../core/types/index.ts';
import { db, type QueryResult } from './client.ts';
import { calculatePagination } from '../core/utils/response.ts';

/**
 * SQL query builder options
 */
interface QueryOptions {
  select?: string[];
  where?: WhereClause[];
  orderBy?: OrderByClause;
  limit?: number;
  offset?: number;
  joins?: JoinClause[];
}

interface WhereClause {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: unknown;
  paramIndex?: number;
}

interface OrderByClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT';
  table: string;
  on: string;
}

/**
 * Builds a parameterized SELECT query
 */
export function buildSelectQuery(
  table: string,
  options: QueryOptions,
  startParamIndex: number = 1
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let paramIndex = startParamIndex;

  // SELECT clause
  const selectFields = options.select?.join(', ') || '*';
  let sql = `SELECT ${selectFields} FROM ${table}`;

  // JOIN clauses
  if (options.joins) {
    for (const join of options.joins) {
      sql += ` ${join.type} JOIN ${join.table} ON ${join.on}`;
    }
  }

  // WHERE clauses
  if (options.where && options.where.length > 0) {
    const conditions = options.where.map((clause) => {
      if (clause.operator === 'IS NULL' || clause.operator === 'IS NOT NULL') {
        return `${clause.field} ${clause.operator}`;
      }
      if (clause.operator === 'IN') {
        const values = clause.value as unknown[];
        const placeholders = values.map(() => `$${paramIndex++}`).join(', ');
        params.push(...values);
        return `${clause.field} IN (${placeholders})`;
      }
      params.push(clause.value);
      return `${clause.field} ${clause.operator} $${paramIndex++}`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  // ORDER BY clause
  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy.field} ${options.orderBy.direction}`;
  }

  // LIMIT and OFFSET
  if (options.limit !== undefined) {
    sql += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
  }
  if (options.offset !== undefined) {
    sql += ` OFFSET $${paramIndex++}`;
    params.push(options.offset);
  }

  return { sql, params };
}

/**
 * Builds a parameterized INSERT query
 */
export function buildInsertQuery(
  table: string,
  data: Record<string, unknown>,
  returning: string[] = ['*']
): { sql: string; params: unknown[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returning.join(', ')}`;

  return { sql, params: values };
}

/**
 * Builds a parameterized UPDATE query
 */
export function buildUpdateQuery(
  table: string,
  id: string,
  data: Record<string, unknown>,
  returning: string[] = ['*']
): { sql: string; params: unknown[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);

  const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
  const idParamIndex = columns.length + 1;

  const sql = `UPDATE ${table} SET ${setClause} WHERE id = $${idParamIndex} RETURNING ${returning.join(', ')}`;

  return { sql, params: [...values, id] };
}

/**
 * Builds a parameterized DELETE query
 */
export function buildDeleteQuery(
  table: string,
  id: string
): { sql: string; params: unknown[] } {
  return {
    sql: `DELETE FROM ${table} WHERE id = $1`,
    params: [id],
  };
}

/**
 * Builds a soft delete query (sets deleted_at timestamp)
 */
export function buildSoftDeleteQuery(
  table: string,
  id: string,
  deletedBy: string
): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE ${table} SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 RETURNING *`,
    params: [deletedBy, id],
  };
}

/**
 * Executes a paginated query and returns results with pagination metadata
 */
export async function executePaginatedQuery<T>(
  baseQuery: string,
  countQuery: string,
  params: unknown[],
  pagination: PaginationParams
): Promise<PaginatedResult<T>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Add pagination to base query
  const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const paginatedParams = [...params, limit, offset];

  // Execute both queries in parallel
  const [dataResult, countResult] = await Promise.all([
    db.query<T>(paginatedQuery, paginatedParams),
    db.query<{ count: string }>(countQuery, params),
  ]);

  const totalItems = parseInt(countResult.rows[0]?.count || '0', 10);

  return {
    data: dataResult.rows,
    pagination: calculatePagination(page, limit, totalItems),
  };
}

/**
 * Converts camelCase to snake_case for database columns
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Converts snake_case to camelCase for JavaScript objects
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Transforms an object's keys from camelCase to snake_case
 */
export function objectToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

/**
 * Transforms an object's keys from snake_case to camelCase
 */
export function objectToCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

/**
 * Transforms an array of objects from snake_case to camelCase
 */
export function arrayToCamelCase<T>(arr: Record<string, unknown>[]): T[] {
  return arr.map((obj) => objectToCamelCase<T>(obj));
}

/**
 * Generates a new UUID for database records
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Builds WHERE clause for organization scoping
 */
export function withOrganizationScope(
  organizationId: string,
  tableAlias?: string
): WhereClause {
  const field = tableAlias ? `${tableAlias}.organization_id` : 'organization_id';
  return { field, operator: '=', value: organizationId };
}

/**
 * Builds WHERE clause for soft delete filtering
 */
export function withoutDeleted(tableAlias?: string): WhereClause {
  const field = tableAlias ? `${tableAlias}.deleted_at` : 'deleted_at';
  return { field, operator: 'IS NULL' };
}

