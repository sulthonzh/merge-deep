# merge-deep

Zero-dependency deep merge for JavaScript objects and arrays. Immutable by default, with circular reference detection, multiple array merge strategies, and custom conflict resolution.

## Why

Every project eventually needs to deep-merge config objects, layer overrides on top of defaults, or combine partial updates. This module does that without pulling in lodash or adding 50KB to your bundle.

## Install

```bash
npm install merge-deep
```

## Quick start

```js
import { mergeDeep } from 'merge-deep';

const defaults = {
  server: { port: 3000, host: '0.0.0.0' },
  db: { url: 'localhost:5432', pool: { min: 2, max: 10 } },
};

const override = {
  server: { port: 8080 },
  db: { pool: { max: 20 } },
};

const config = mergeDeep(defaults, override);
// { server: { port: 8080, host: '0.0.0.0' }, db: { url: 'localhost:5432', pool: { min: 2, max: 20 } } }

// originals are not mutated
defaults.server.port; // 3000
```

## API

### `mergeDeep(...sources, options?)`

Merge two or more objects. Last argument can be options.

```js
mergeDeep(a, b, c);
mergeDeep(a, b, { arrayStrategy: 'concat' });
```

### `merge(target, source, options?)`

Merge exactly two objects with explicit options.

### `mergeAll(sources[], options?)`

Merge an array of objects into a fresh result. Always immutable.

```js
mergeAll([defaults, envConfig, userConfig]);
```

### `isEqual(a, b)`

Deep equality check (bonus utility).

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `arrayStrategy` | `'replace'` | How to merge arrays: `replace`, `concat`, `merge`, `unique` |
| `clone` | `true` | Return new objects (immutable). Set `false` to mutate the first argument |
| `onCycle` | `'skip'` | Circular ref handling: `'skip'` returns target as-is, `'error'` throws |
| `onConflict` | `null` | `(target, source, key, path) => value` — custom resolver for shared keys |

## Array strategies

```js
// replace (default) — source array wins
mergeDeep({ tags: [1, 2, 3] }, { tags: [4, 5] });
// { tags: [4, 5] }

// concat — append source to target
mergeDeep({ tags: [1, 2] }, { tags: [3, 4] }, { arrayStrategy: 'concat' });
// { tags: [1, 2, 3, 4] }

// merge — index-by-index deep merge, extra elements appended
mergeDeep(
  { servers: [{ host: 'a', port: 80 }] },
  { servers: [{ port: 443 }] },
  { arrayStrategy: 'merge' }
);
// { servers: [{ host: 'a', port: 443 }] }

// unique — concat with dedup
mergeDeep({ tags: ['x', 'y'] }, { tags: ['y', 'z'] }, { arrayStrategy: 'unique' });
// { tags: ['x', 'y', 'z'] }
```

## Custom conflict resolution

```js
const result = mergeDeep(
  { count: 5 },
  { count: 3 },
  {
    onConflict: (target, source, key, path) => {
      if (key === 'count') return target[key] + source[key];
      // return undefined to use default behavior
    },
  }
);
// { count: 8 }
```

## CLI

```bash
# Merge two JSON files
mergedeep base.json overlay.json --pretty

# Pipe through stdin
cat config.json | mergedeep --overlay patch.json --array merge

# Strategies: replace (default), concat, merge, unique
mergedeep a.json b.json --array concat
```

## Design decisions

- **Zero dependencies.** Nothing to audit, nothing to break.
- **Immutable by default.** Your inputs don't change. Opt out with `{ clone: false }`.
- **Symbol keys preserved.** Non-string keys are carried over.
- **Circular-safe.** Won't infinite-loop on self-referencing objects.
- **Right-wins for primitives.** When types don't match, the source value replaces the target.
- **Plain objects only.** Class instances, Dates, RegExps, etc. are treated as opaque values (right-wins), not deep-merged.

## License

MIT
