# momentkaph_be

## TypeScript Tooling

Node speaks JavaScript. These three tools bridge the gap between your `.ts` source and Node — each differently.

---

## `tsc` — Official TypeScript Compiler

The only tool that actually **understands your types**. Does two things: type checking + emitting `.js` files to disk.

```
.ts files  →  tsc  →  dist/*.js  →  node dist/index.js
```

Runs **ahead-of-time** — before Node is involved at all.

```bash
tsc            # type-check + emit .js to dist/
tsc --noEmit   # type-check only, no files written — use this in CI
```

---

## `ts-node` — Just-in-Time Compiler

Hooks into Node's loader and compiles TypeScript **on import**, in memory. No build step, but runs full type checking on every startup — slow.

```
node src/index.ts
  → ts-node intercepts .ts files
  → compiles in memory (with type checking)
  → hands JS to Node
  → repeats for every import
```

---

## `tsx` — Fast Just-in-Time Stripper

Same idea as `ts-node`, but uses esbuild and **skips type checking**. Just strips TypeScript syntax and runs. Fast.

```
node src/index.ts (via tsx)
  → tsx intercepts .ts files
  → strips types, no checking
  → hands JS to Node instantly
```

---

## The Two Jobs

| Job | Tool |
|-----|------|
| Type checking | `tsc` only |
| Run code in dev | `tsx watch` |
| Deploy | `tsc` → `node dist/index.js` |

> **The rule:** checking types and running code are separate concerns. Keep them that way.