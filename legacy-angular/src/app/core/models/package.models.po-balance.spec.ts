import { describe, expect, it } from 'vitest';

import { computePurchaseOrderLineBalance } from './package.models';

describe('computePurchaseOrderLineBalance', () => {
  it('uses consumed quantity when it is higher than allocated quantity', () => {
    const result = computePurchaseOrderLineBalance(10, 2, 7);

    expect(result).toEqual({
      allocatedQuantity: 7,
      remainingQuantity: 3,
    });
  });

  it('uses allocation quantity when it is higher than consumed quantity', () => {
    const result = computePurchaseOrderLineBalance(10, 6, 2);

    expect(result).toEqual({
      allocatedQuantity: 6,
      remainingQuantity: 4,
    });
  });

  it('clamps effective allocated quantity to ordered quantity', () => {
    const result = computePurchaseOrderLineBalance(5, 12, 8);

    expect(result).toEqual({
      allocatedQuantity: 5,
      remainingQuantity: 0,
    });
  });
});
