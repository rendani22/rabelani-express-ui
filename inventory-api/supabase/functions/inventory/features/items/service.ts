/**
 * Items Service
 * Business logic layer for item management
 */

import { itemsRepository } from './repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Item,
  ItemWithStock,
  ItemVariant,
  ItemAttribute,
  ItemFilters,
} from './types.ts';
import type {
  CreateItemInput,
  UpdateItemInput,
  CreateVariantInput,
  CreateAttributeInput,
} from './validation.ts';
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { NotFoundError, ConflictError } from '../../core/errors/index.ts';

/**
 * Items Service Class
 * Contains all business logic for item operations
 */
export class ItemsService {
  /**
   * Creates a new item in the catalog
   */
  async createItem(
    user: AuthUser,
    input: CreateItemInput
  ): Promise<Item> {
    // Business rule: SKU must be unique within organization
    const existingItem = await itemsRepository.findBySku(input.sku, user.organizationId);
    if (existingItem) {
      throw new ConflictError(`Item with SKU '${input.sku}' already exists`);
    }

    // Create the item
    const item = await itemsRepository.create(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'items',
      'CREATE',
      'item',
      item.id,
      user,
      calculateChanges(null, {
        sku: item.sku,
        name: item.name,
        category: item.category,
        unitCost: item.unitCost,
      })
    );

    return item;
  }

  /**
   * Retrieves all items with filtering and pagination
   */
  async getItems(
    user: AuthUser,
    filters: ItemFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<ItemWithStock>> {
    return await itemsRepository.findAll(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Retrieves a single item by ID
   */
  async getItemById(
    user: AuthUser,
    itemId: string
  ): Promise<Item> {
    const item = await itemsRepository.findById(itemId, user.organizationId);

    if (!item) {
      throw new NotFoundError('Item', itemId);
    }

    return item;
  }

  /**
   * Updates an existing item
   */
  async updateItem(
    user: AuthUser,
    itemId: string,
    input: UpdateItemInput
  ): Promise<Item> {
    // Get current item for audit comparison
    const currentItem = await itemsRepository.findById(itemId, user.organizationId);
    if (!currentItem) {
      throw new NotFoundError('Item', itemId);
    }

    // Update the item
    const updatedItem = await itemsRepository.update(
      itemId,
      input,
      user.organizationId,
      user.id
    );

    if (!updatedItem) {
      throw new NotFoundError('Item', itemId);
    }

    // Create audit log with changes
    await createAuditLog(
      'items',
      'UPDATE',
      'item',
      itemId,
      user,
      calculateChanges(
        currentItem as unknown as Record<string, unknown>,
        updatedItem as unknown as Record<string, unknown>
      )
    );

    return updatedItem;
  }

  /**
   * Creates a variant for an existing item
   * Variants represent different configurations (size, color, etc.)
   */
  async createVariant(
    user: AuthUser,
    itemId: string,
    input: CreateVariantInput
  ): Promise<ItemVariant> {
    // Verify the parent item exists
    const item = await itemsRepository.findById(itemId, user.organizationId);
    if (!item) {
      throw new NotFoundError('Item', itemId);
    }

    // Business rule: Variant SKU must also be unique
    const existingItem = await itemsRepository.findBySku(input.sku, user.organizationId);
    if (existingItem) {
      throw new ConflictError(`SKU '${input.sku}' already exists`);
    }

    // Create the variant
    const variant = await itemsRepository.createVariant(itemId, input, user.id);

    // Create audit log
    await createAuditLog(
      'items',
      'CREATE',
      'item_variant',
      variant.id,
      user,
      calculateChanges(null, {
        itemId,
        sku: variant.sku,
        name: variant.name,
        attributes: variant.attributes,
      })
    );

    return variant;
  }

  /**
   * Creates a new attribute definition
   * Attributes define what properties variants can have
   */
  async createAttribute(
    user: AuthUser,
    input: CreateAttributeInput
  ): Promise<ItemAttribute> {
    // Create the attribute
    const attribute = await itemsRepository.createAttribute(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'items',
      'CREATE',
      'item_attribute',
      attribute.id,
      user,
      calculateChanges(null, {
        name: attribute.name,
        code: attribute.code,
        dataType: attribute.dataType,
      })
    );

    return attribute;
  }

  /**
   * Gets all variants for an item
   */
  async getItemVariants(
    user: AuthUser,
    itemId: string
  ): Promise<ItemVariant[]> {
    // Verify item exists and belongs to user's org
    const item = await itemsRepository.findById(itemId, user.organizationId);
    if (!item) {
      throw new NotFoundError('Item', itemId);
    }

    return await itemsRepository.findVariantsByItemId(itemId);
  }

  /**
   * Deactivates an item (soft delete)
   */
  async deactivateItem(
    user: AuthUser,
    itemId: string
  ): Promise<void> {
    const item = await itemsRepository.findById(itemId, user.organizationId);
    if (!item) {
      throw new NotFoundError('Item', itemId);
    }

    await itemsRepository.delete(itemId, user.organizationId, user.id);

    // Create audit log
    await createAuditLog(
      'items',
      'DELETE',
      'item',
      itemId,
      user,
      calculateChanges({ isActive: true }, { isActive: false, deletedAt: new Date() })
    );
  }
}

// Export singleton instance
export const itemsService = new ItemsService();

