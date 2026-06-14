import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDeep, merge, mergeAll, isEqual } from './index.js';

describe('mergeDeep — basic object merging', () => {
  test('merges two flat objects', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const result = mergeDeep(a, b);
    assert.deepEqual(result, { x: 1, y: 3, z: 4 });
  });

  test('merges nested objects', () => {
    const a = { user: { name: 'Alice', age: 30 } };
    const b = { user: { age: 31, city: 'NYC' } };
    assert.deepEqual(mergeDeep(a, b), { user: { name: 'Alice', age: 31, city: 'NYC' } });
  });

  test('deeply nested objects', () => {
    const a = { a: { b: { c: { d: 1 } } } };
    const b = { a: { b: { c: { e: 2 } } } };
    assert.deepEqual(mergeDeep(a, b), { a: { b: { c: { d: 1, e: 2 } } } });
  });

  test('right-wins for primitives', () => {
    assert.deepEqual(mergeDeep({ x: 1 }, { x: 2 }), { x: 2 });
    assert.deepEqual(mergeDeep({ x: 'a' }, { x: 'b' }), { x: 'b' });
    assert.deepEqual(mergeDeep({ x: true }, { x: false }), { x: false });
    assert.deepEqual(mergeDeep({ x: 1 }, { x: null }), { x: null });
  });
});

describe('mergeDeep — immutability', () => {
  test('does not mutate inputs', () => {
    const a = { x: { y: 1 } };
    const b = { x: { z: 2 } };
    const result = mergeDeep(a, b);
    assert.deepEqual(a, { x: { y: 1 } });
    assert.deepEqual(b, { x: { z: 2 } });
    assert.deepEqual(result, { x: { y: 1, z: 2 } });
    assert.notEqual(result.x, a.x);
  });

  test('clone: false mutates first object', () => {
    const a = { x: { y: 1 } };
    const b = { x: { z: 2 } };
    const result = mergeDeep(a, b, { clone: false });
    assert.strictEqual(result, a);
    assert.deepEqual(a, { x: { y: 1, z: 2 } });
  });
});

describe('mergeDeep — array strategies', () => {
  test('replace (default)', () => {
    const a = { list: [1, 2, 3] };
    const b = { list: [4, 5] };
    assert.deepEqual(mergeDeep(a, b), { list: [4, 5] });
  });

  test('concat', () => {
    const a = { list: [1, 2, 3] };
    const b = { list: [4, 5] };
    assert.deepEqual(mergeDeep(a, b, { arrayStrategy: 'concat' }), { list: [1, 2, 3, 4, 5] });
  });

  test('merge by index', () => {
    const a = { items: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
    const b = { items: [{ name: 'c' }, { name: 'd' }, { id: 3, name: 'e' }] };
    const result = mergeDeep(a, b, { arrayStrategy: 'merge' });
    assert.deepEqual(result, {
      items: [
        { id: 1, name: 'c' },
        { id: 2, name: 'd' },
        { id: 3, name: 'e' },
      ],
    });
  });

  test('unique', () => {
    const a = { tags: ['x', 'y'] };
    const b = { tags: ['y', 'z'] };
    assert.deepEqual(mergeDeep(a, b, { arrayStrategy: 'unique' }), { tags: ['x', 'y', 'z'] });
  });
});

describe('mergeDeep — circular references', () => {
  test('skip cycle by default', () => {
    const a = { name: 'a' };
    const b = { name: 'b' };
    a.self = a;
    b.self = b;
    // Should not hang, should complete
    const result = mergeDeep(a, b, { clone: false });
    assert.equal(result.name, 'b');
  });

  test('error on cycle when configured', () => {
    const a = {};
    const b = {};
    a.self = a; // circular in target
    b.self = b; // circular in source — both keys match so merge recurses
    assert.throws(
      () => mergeDeep(a, b, { onCycle: 'error', clone: false }),
      /Circular reference detected/
    );
  });
});

describe('mergeDeep — multiple sources', () => {
  test('merges 3+ sources', () => {
    const result = mergeDeep(
      { a: 1, b: { x: 1 } },
      { b: { y: 2 }, c: 3 },
      { c: 4, b: { z: 3 } }
    );
    assert.deepEqual(result, { a: 1, b: { x: 1, y: 2, z: 3 }, c: 4 });
  });
});

describe('mergeDeep — custom conflict handler', () => {
  test('onConflict called for shared keys', () => {
    const result = mergeDeep(
      { count: 5 },
      { count: 3 },
      {
        onConflict: (target, source, key) => target[key] + source[key],
      }
    );
    assert.equal(result.count, 8);
  });

  test('onConflict can return undefined to use default', () => {
    const result = mergeDeep(
      { x: 1 },
      { x: 2 },
      {
        onConflict: () => undefined,
      }
    );
    assert.equal(result.x, 2);
  });

  test('onConflict receives path', () => {
    const calls = [];
    const result = mergeDeep(
      { nested: { val: 1 } },
      { nested: { val: 2 } },
      {
        onConflict: (t, s, k, path) => {
          calls.push({ key: k, path });
          if (k === 'val') return 999;
          return undefined;
        },
      }
    );
    assert.equal(result.nested.val, 999);
    assert.deepEqual(calls.find((c) => c.key === 'val').path, ['nested', 'val']);
  });
});

describe('mergeDeep — edge cases', () => {
  test('undefined source values', () => {
    const result = mergeDeep({ a: 1, b: 2 }, { b: undefined });
    assert.equal(result.b, undefined);
  });

  test('symbol keys are preserved', () => {
    const sym = Symbol('test');
    const a = { [sym]: 1, x: 2 };
    const b = { x: 3 };
    const result = mergeDeep(a, b);
    assert.equal(result[sym], 1);
    assert.equal(result.x, 3);
  });

  test('merges objects with null values', () => {
    const result = mergeDeep({ a: null, b: 2 }, { a: { x: 1 } });
    assert.deepEqual(result, { a: { x: 1 }, b: 2 });
  });

  test('source is array, target is object', () => {
    const result = mergeDeep({ x: 1 }, [1, 2]);
    assert.deepEqual(result, [1, 2]);
  });

  test('mixed type override', () => {
    assert.deepEqual(mergeDeep({ x: { a: 1 } }, { x: 'string' }), { x: 'string' });
    assert.deepEqual(mergeDeep({ x: 'string' }, { x: { a: 1 } }), { x: { a: 1 } });
    assert.deepEqual(mergeDeep({ x: [1] }, { x: { a: 1 } }), { x: { a: 1 } });
  });
});

describe('merge — two-arg API', () => {
  test('basic merge', () => {
    const result = merge({ a: 1, b: 2 }, { b: 3, c: 4 });
    assert.deepEqual(result, { a: 1, b: 3, c: 4 });
  });

  test('with options', () => {
    const result = merge({ arr: [1] }, { arr: [2] }, { arrayStrategy: 'concat' });
    assert.deepEqual(result, { arr: [1, 2] });
  });
});

describe('mergeAll — array API', () => {
  test('merges array of objects', () => {
    const result = mergeAll([{ a: 1 }, { b: 2 }, { c: 3 }]);
    assert.deepEqual(result, { a: 1, b: 2, c: 3 });
  });

  test('empty array returns {}', () => {
    assert.deepEqual(mergeAll([]), {});
  });

  test('always immutable', () => {
    const src = { x: 1 };
    const result = mergeAll([src]);
    assert.notEqual(result, src);
  });
});

describe('isEqual — bonus utility', () => {
  test('primitives', () => {
    assert.equal(isEqual(1, 1), true);
    assert.equal(isEqual('a', 'a'), true);
    assert.equal(isEqual(1, 2), false);
    assert.equal(isEqual(null, null), true);
    assert.equal(isEqual(undefined, undefined), true);
  });

  test('flat objects', () => {
    assert.equal(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 }), true);
    assert.equal(isEqual({ a: 1 }, { a: 1, b: 2 }), false);
  });

  test('nested objects', () => {
    assert.equal(isEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }), true);
    assert.equal(isEqual({ a: { b: 1 } }, { a: { b: 2 } }), false);
  });

  test('arrays', () => {
    assert.equal(isEqual([1, 2, 3], [1, 2, 3]), true);
    assert.equal(isEqual([1, 2], [1, 2, 3]), false);
    assert.equal(isEqual([1, [2]], [1, [2]]), true);
  });

  test('different types', () => {
    assert.equal(isEqual([1, 2], { 0: 1, 1: 2 }), false);
    assert.equal(isEqual(null, {}), false);
  });
});

describe('mergeDeep — real-world scenarios', () => {
  test('config merging', () => {
    const defaults = {
      server: { port: 3000, host: '0.0.0.0' },
      db: { url: 'localhost:5432', pool: { min: 2, max: 10 } },
      features: { auth: true, logging: { level: 'info' } },
    };
    const override = {
      server: { port: 8080 },
      db: { pool: { max: 20 } },
      features: { logging: { format: 'json' } },
    };
    const result = mergeDeep(defaults, override);
    assert.deepEqual(result, {
      server: { port: 8080, host: '0.0.0.0' },
      db: { url: 'localhost:5432', pool: { min: 2, max: 20 } },
      features: { auth: true, logging: { level: 'info', format: 'json' } },
    });
    // Originals unchanged
    assert.equal(defaults.server.port, 3000);
    assert.equal(defaults.db.pool.max, 10);
  });

  test('feature flags layering', () => {
    const base = { flags: { darkMode: false, beta: false } };
    const env = { flags: { darkMode: true } };
    const user = { flags: { beta: true } };
    const result = mergeDeep(base, env, user);
    assert.deepEqual(result, { flags: { darkMode: true, beta: true } });
  });

  test('array of objects merge by index', () => {
    const defaults = {
      servers: [
        { host: 'a', port: 80 },
        { host: 'b', port: 80 },
      ],
    };
    const override = {
      servers: [{ port: 443 }],
    };
    const result = mergeDeep(defaults, override, { arrayStrategy: 'merge' });
    assert.deepEqual(result, {
      servers: [
        { host: 'a', port: 443 },
        { host: 'b', port: 80 },
      ],
    });
  });
});
