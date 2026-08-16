---
name: Orval nullable-object codegen bug
description: Codegen emits invalid `interface X {...} | null` for nullable object schemas; patch generated output after every codegen run.
---

Orval emits invalid TS for a top-level `nullable: true` object schema: `export interface X {...} | null` instead of a type alias. Committed generated files carry the hand-fixed `export type X = {...} | null;` form, so every fresh codegen run reintroduces the syntax error.

**Why:** upstream orval bug, unfixable in config.

**How to apply:** after codegen, restore affected generated files to the type-alias form before typechecking. Shared libs use TS project references — rebuild them (`tsc -b`) after schema/spec changes or dependents see stale declarations.
