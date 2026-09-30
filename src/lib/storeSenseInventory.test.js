import { describe, expect, it } from 'vitest';
import { isStoreSenseRowReady, parseStoreSenseInventory } from './storeSenseInventory';

describe('StoreSense inventory parser', () => {
  it('arranges labelled free text and comma rows into inventory fields', () => {
    const result = parseStoreSenseInventory(
      [
        'Peak Milk 400g cost 1200 sell 1500 stock 24 category Beverages',
        'Indomie Chicken 70g, Food Cupboard & Dry Foods, 170, 250, 40',
      ].join('\n'),
      {
        categories: ['Beverages', 'Food Cupboard & Dry Foods'],
        existingSkus: ['PEA-MIL-400G-0000'],
      }
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      name: 'Peak Milk 400g',
      category: 'Beverages',
      costPrice: 1200,
      salePrice: 1500,
      stock: 24,
    });
    expect(result.rows[0].sku).toMatch(/^PEA-MIL-400G-[0-9A-F]{4}$/);
    expect(result.rows[0].sku).not.toBe('PEA-MIL-400G-0000');
    expect(result.rows[1]).toMatchObject({
      name: 'Indomie Chicken 70g',
      category: 'Food Cupboard & Dry Foods',
      costPrice: 170,
      salePrice: 250,
      stock: 40,
    });
  });

  it('respects header rows and manual SKU/barcode values', () => {
    const result = parseStoreSenseInventory(
      'name,category,cost,selling price,stock,sku\nEva Water 75cl,Beverages,80,150,36,EVA-75CL',
      { categories: ['Beverages'] }
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: 'Eva Water 75cl',
      category: 'Beverages',
      costPrice: 80,
      salePrice: 150,
      stock: 36,
      sku: 'EVA-75CL',
    });
  });

  it('keeps incomplete lines in the preview so the user can fix them', () => {
    const result = parseStoreSenseInventory('Mystery box category General');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Mystery box');
    expect(result.rows[0].issues).toContain('Add selling price');
    expect(isStoreSenseRowReady(result.rows[0])).toBe(false);
  });
});
