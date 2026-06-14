'use strict';

/**
 * merge-deep — Zero-dependency deep merge for plain objects and arrays.
 *
 * - Immutable by default (returns new objects/arrays)
 * - Circular reference detection (no infinite loops)
 * - Array merge strategies: replace (default), concat, merge-by-index, unique
 * - Custom merge strategies via onConflict
 * - Symbol keys preserved
 * - Non-mergeable values (primitives, functions, etc.) use right-wins
 * - onCycle handler for circular refs (skip / error / clone)
 */

const DEFAULT_OPTS = {
  arrayStrategy: 'replace', // 'replace' | 'concat' | 'merge' | 'unique'
  clone: true,              // return new objects (immutable)
  onCycle: 'skip',          // 'skip' | 'error' | null
  onConflict: null,         // (target, source, key, path) => value | undefined
};

/**
 * Check if value is a plain object (not a class instance, not an array).
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep clone a plain object or array (shallow for non-plain values).
 */
function deepClone(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value === 'function') return value;
  if (seen.has(value)) return undefined; // circular ref in clone — return undefined
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => deepClone(v, seen));
  }
  if (isPlainObject(value)) {
    const result = {};
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      const cloned = deepClone(value[key], seen);
      if (cloned !== undefined) {
        result[key] = cloned;
      }
    }
    return result;
  }
  // Date, RegExp, Map, Set, etc. — return as-is (can't deep clone without deps)
  return value;
}

/**
 * Merge two arrays based on strategy.
 */
function mergeArrays(target, source, strategy) {
  switch (strategy) {
    case 'replace':
      return source.map((v) => (isPlainObject(v) || Array.isArray(v) ? deepClone(v) : v));

    case 'concat':
      return [
        ...target.map((v) => (isPlainObject(v) || Array.isArray(v) ? deepClone(v) : v)),
        ...source.map((v) => (isPlainObject(v) || Array.isArray(v) ? deepClone(v) : v)),
      ];

    case 'merge': {
      // Merge by index: target[i] + source[i], extra elements appended
      const maxLen = Math.max(target.length, source.length);
      const result = [];
      for (let i = 0; i < maxLen; i++) {
        if (i < target.length && i < source.length) {
          if (isPlainObject(target[i]) && isPlainObject(source[i])) {
            result.push(mergeDeepInternal(deepClone(target[i]), deepClone(source[i]), DEFAULT_OPTS, new WeakSet(), []));
          } else if (Array.isArray(target[i]) && Array.isArray(source[i])) {
            result.push(mergeArrays(deepClone(target[i]), deepClone(source[i]), strategy));
          } else {
            result.push(deepClone(source[i]));
          }
        } else if (i < target.length) {
          result.push(deepClone(target[i]));
        } else {
          result.push(deepClone(source[i]));
        }
      }
      return result;
    }

    case 'unique': {
      const seen = new Set();
      const result = [];
      const addUnique = (val) => {
        const key = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(isPlainObject(val) || Array.isArray(val) ? deepClone(val) : val);
        }
      };
      for (const v of target) addUnique(v);
      for (const v of source) addUnique(v);
      return result;
    }

    default:
      return source.map((v) => (isPlainObject(v) || Array.isArray(v) ? deepClone(v) : v));
  }
}

/**
 * Internal deep merge core.
 */
function mergeDeepInternal(target, source, opts, seen, path) {
  // If source is not a plain object or array, right-wins
  if (!isPlainObject(source) && !Array.isArray(source)) {
    return opts.clone ? deepClone(source) : source;
  }

  // If target is not a plain object but source is, take source
  if (isPlainObject(source) && !isPlainObject(target)) {
    return opts.clone ? deepClone(source) : source;
  }

  // Both arrays
  if (Array.isArray(source) && Array.isArray(target)) {
    return mergeArrays(target, source, opts.arrayStrategy);
  }

  // If source is array but target isn't, take source
  if (Array.isArray(source) && !Array.isArray(target)) {
    return opts.clone ? deepClone(source) : source;
  }

  // Both are plain objects — merge keys
  // Check for circular references in source or target
  if (seen.has(source) || seen.has(target)) {
    if (opts.onCycle === 'error') {
      throw new Error(`Circular reference detected at path: ${path.join('.')}`);
    }
    // 'skip' — return target as-is
    return opts.clone ? deepClone(target) : target;
  }
  seen.add(source);
  seen.add(target);

  const result = opts.clone ? {} : target;

  // Copy all target keys (including symbols)
  if (opts.clone) {
    const targetKeys = Reflect.ownKeys(target);
    for (const key of targetKeys) {
      const val = target[key];
      result[key] = isPlainObject(val) || Array.isArray(val) ? deepClone(val) : val;
    }
  }

  // Merge source keys
  const sourceKeys = Reflect.ownKeys(source);
  for (const key of sourceKeys) {
    const sourceVal = source[key];
    const currentPath = [...path, String(key)];

    // Custom conflict handler
    if (opts.onConflict && key in result) {
      const custom = opts.onConflict(result, source, key, currentPath);
      if (custom !== undefined) {
        result[key] = custom;
        continue;
      }
    }

    if (key in result) {
      // Both have this key — recurse
      if (isPlainObject(result[key]) && isPlainObject(sourceVal)) {
        result[key] = mergeDeepInternal(result[key], sourceVal, opts, seen, currentPath);
      } else if (Array.isArray(result[key]) && Array.isArray(sourceVal)) {
        result[key] = mergeArrays(result[key], sourceVal, opts.arrayStrategy);
      } else {
        // Type mismatch or primitive — right wins
        result[key] = opts.clone
          ? isPlainObject(sourceVal) || Array.isArray(sourceVal)
            ? deepClone(sourceVal)
            : sourceVal
          : sourceVal;
      }
    } else {
      // Key only in source — clone it
      result[key] = opts.clone
        ? isPlainObject(sourceVal) || Array.isArray(sourceVal)
          ? deepClone(sourceVal)
          : sourceVal
        : sourceVal;
    }
  }

  return result;
}

/**
 * Deeply merge two or more objects.
 *
 * @param {...(Object|Array)} sources - Two or more objects/arrays to merge
 * @param {Object} [options] - Merge options
 * @param {string} options.arrayStrategy='replace' - How to handle arrays: 'replace' | 'concat' | 'merge' | 'unique'
 * @param {boolean} options.clone=true - Return new objects (immutable)
 * @param {string} options.onCycle='skip' - Circular ref handling: 'skip' | 'error'
 * @param {Function} options.onConflict=null - Custom conflict resolver (target, source, key, path) => value
 * @returns {Object|Array} Merged result
 */
export function mergeDeep(...sources) {
  if (sources.length < 2) {
    throw new Error('mergeDeep requires at least 2 arguments');
  }

  // Extract options from last argument if it has merge-related keys and no other own keys
  let opts = { ...DEFAULT_OPTS };
  let objects = sources;

  const last = sources[sources.length - 1];
  if (
    isPlainObject(last) &&
    !Array.isArray(last) &&
    sources.length > 2 &&
    ('arrayStrategy' in last || 'clone' in last || 'onCycle' in last || 'onConflict' in last)
  ) {
    // Check if ALL keys are option keys
    const keys = Object.keys(last);
    const optionKeys = new Set(['arrayStrategy', 'clone', 'onCycle', 'onConflict']);
    const isOnlyOptions = keys.every((k) => optionKeys.has(k));
    if (isOnlyOptions) {
      opts = { ...opts, ...last };
      objects = sources.slice(0, -1);
    }
  }

  if (objects.length < 2) {
    throw new Error('mergeDeep requires at least 2 objects to merge');
  }

  let result = objects[0];
  result = opts.clone
    ? isPlainObject(result) || Array.isArray(result)
      ? deepClone(result)
      : result
    : result;

  for (let i = 1; i < objects.length; i++) {
    result = mergeDeepInternal(result, objects[i], opts, new WeakSet(), []);
  }

  return result;
}

/**
 * Merge exactly two objects (simpler API).
 */
export function merge(target, source, options = {}) {
  const opts = { ...DEFAULT_OPTS, ...options };
  const t = opts.clone && (isPlainObject(target) || Array.isArray(target)) ? deepClone(target) : target;
  return mergeDeepInternal(t, source, opts, new WeakSet(), []);
}

/**
 * Merge many objects into a fresh object (always immutable).
 */
export function mergeAll(sources, options = {}) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return {};
  }
  const opts = { ...DEFAULT_OPTS, ...options, clone: true };
  let result = {};
  for (const source of sources) {
    result = mergeDeepInternal(result, source, opts, new WeakSet(), []);
  }
  return result;
}

/**
 * Check if two values are deeply equal (bonus utility — useful for testing merges).
 */
export function isEqual(a, b, seen = new WeakSet()) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (seen.has(a) && seen.has(b)) return true;
  seen.add(a);
  seen.add(b);
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!isEqual(a[key], b[key], seen)) return false;
  }
  return true;
}

// CommonJS compat
export default mergeDeep;
