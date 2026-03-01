/**
 * Database Configuration
 * Environment-based database settings
 */

// Database connection configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  idleTimeout: number;
  connectionTimeout: number;
}

// Environment types
type Environment = 'development' | 'staging' | 'production' | 'test';

/**
 * Gets the current environment
 */
function getEnvironment(): Environment {
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('NODE_ENV') || 'development';
  return env as Environment;
}

/**
 * Environment-specific configurations
 */
const configs: Record<Environment, Partial<DatabaseConfig>> = {
  development: {
    host: 'localhost',
    port: 5432,
    database: 'inventory_dev',
    user: 'postgres',
    password: '',
    ssl: false,
    poolSize: 5,
    idleTimeout: 30000,
    connectionTimeout: 10000,
  },
  test: {
    host: 'localhost',
    port: 5432,
    database: 'inventory_test',
    user: 'postgres',
    password: '',
    ssl: false,
    poolSize: 2,
    idleTimeout: 10000,
    connectionTimeout: 5000,
  },
  staging: {
    host: '',  // From environment
    port: 5432,
    database: 'inventory_staging',
    ssl: true,
    poolSize: 10,
    idleTimeout: 60000,
    connectionTimeout: 15000,
  },
  production: {
    host: '',  // From environment
    port: 5432,
    database: 'inventory',
    ssl: true,
    poolSize: 20,
    idleTimeout: 120000,
    connectionTimeout: 20000,
  },
};

/**
 * Gets the database configuration for the current environment
 * Environment variables override default values
 */
export function getDatabaseConfig(): DatabaseConfig {
  const env = getEnvironment();
  const envConfig = configs[env];

  return {
    host: Deno.env.get('DB_HOST') || envConfig.host || 'localhost',
    port: parseInt(Deno.env.get('DB_PORT') || String(envConfig.port) || '5432', 10),
    database: Deno.env.get('DB_NAME') || envConfig.database || 'inventory',
    user: Deno.env.get('DB_USER') || envConfig.user || 'postgres',
    password: Deno.env.get('DB_PASSWORD') || envConfig.password || '',
    ssl: Deno.env.get('DB_SSL') === 'true' || envConfig.ssl || false,
    poolSize: parseInt(Deno.env.get('DB_POOL_SIZE') || String(envConfig.poolSize) || '10', 10),
    idleTimeout: parseInt(Deno.env.get('DB_IDLE_TIMEOUT') || String(envConfig.idleTimeout) || '30000', 10),
    connectionTimeout: parseInt(Deno.env.get('DB_CONNECTION_TIMEOUT') || String(envConfig.connectionTimeout) || '10000', 10),
  };
}

/**
 * Validates database configuration
 */
export function validateDatabaseConfig(config: DatabaseConfig): string[] {
  const errors: string[] = [];

  if (!config.host) {
    errors.push('DB_HOST is required');
  }

  if (!config.database) {
    errors.push('DB_NAME is required');
  }

  if (!config.user) {
    errors.push('DB_USER is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push('DB_PORT must be between 1 and 65535');
  }

  if (config.poolSize < 1) {
    errors.push('DB_POOL_SIZE must be at least 1');
  }

  return errors;
}

/**
 * Gets the database connection URL
 */
export function getDatabaseUrl(): string {
  const config = getDatabaseConfig();
  const protocol = config.ssl ? 'postgres' : 'postgres';
  const sslParam = config.ssl ? '?sslmode=require' : '';

  return `${protocol}://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`;
}

