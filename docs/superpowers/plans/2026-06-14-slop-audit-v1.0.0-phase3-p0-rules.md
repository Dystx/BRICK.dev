# slop-audit v1.0.0 — Phase 3: P0 Rules

**Goal:** Implement the seven P0 rules from the engineering design document, wire them into the `RuleRegistry`, and pass the integration gate.

**Design reference:** `docs/superpowers/specs/2026-06-14-slop-audit-v1.0.0-design.md` §3.12

---

## Task 1: Shared rule utilities

Create `src/rules/utils.ts` with helpers needed by multiple rules:

- `splitClassName(value: string): string[]` — split a class string on whitespace, ignoring empty entries.
- `isLayoutArbitrary(className: string): boolean` — true for `w-[...]`, `h-[...]`, `p-[...]`, `m-[...]`, `gap-[...]`, `px-[...]`, `py-[...]`, `mx-[...]`, `my-[...]`, `min-w-[...]`, `min-h-[...]`, `max-w-[...]`, `max-h-[...]`, `inset-[...]`.
- `isArbitraryColor(className: string): boolean` — true for `bg-[...]`, `text-[...]`, `border-[...]`, `ring-[...]`, `shadow-[...]`, `from-[...]`, `to-[...]`, etc. (used to know what to exempt, not necessarily to flag).
- `matchesAllowlist(className: string, allowlist: (string | RegExp)[]): boolean` — exact string match or regex test.
- `hasAllClasses(classNames: string[], required: string[]): boolean`.
- `hasAnyClass(classNames: string[], candidates: string[]): boolean`.
- `isSizingToken(className: string): boolean` — true for `h-*`, `w-*`, `p-*`, `min-w-*`, `min-h-*`, `size-*`, `aspect-*`, etc.
- `isFocusRingClass(className: string): boolean` — true for `focus:ring-*`, `focus-visible:ring-*`.
- `isOutlineRemoval(className: string): boolean` — true for `outline-none`, `focus:outline-none`.

Add `tests/rules/utils.test.ts` covering each helper.

---

## Task 2: Visitor enhancement for zombie-state tracking

Extend `ScanFacts` and the visitor so the `logic/zombie-state` rule can determine whether a destructured `useState` value or setter is referenced.

- Add `stateBindings: StateBinding[]` to `ComponentFacts`:
  ```ts
  export interface StateBinding {
    valueName?: string;
    setterName?: string;
    line: number;
    column: number;
    valueReferenced: boolean;
    setterReferenced: boolean;
  }
  ```
- In `extractFacts`, when visiting a `VariableDeclarator` whose initializer is `useState(...)`:
  - Record binding names from `ArrayPattern` elements.
  - Walk the enclosing function body and mark `valueReferenced` / `setterReferenced` when an identifier with the binding name is used outside the initializer.
- Update `tests/engine/visitor.test.ts` to assert `stateBindings` are populated and reference flags are accurate.

---

## Task 3: `visual/arbitrary-escape`

Create `src/rules/visual/arbitrary-escape.ts`:

- ID: `visual/arbitrary-escape`
- Category: `visual`
- Severity: `medium`
- AI-specific: true
- Trigger: static `className` / `class` value contains a layout arbitrary value not exempt by `config.arbitraryValueAllowlist`.
- Output one issue per offending class string (not per class) with line/column of the attribute.

Create `tests/rules/arbitrary-escape.test.ts` with passing and failing fixtures.

---

## Task 4: `visual/generic-centering`

Create `src/rules/visual/generic-centering.ts`:

- ID: `visual/generic-centering`
- Category: `visual`
- Severity: `low`
- AI-specific: true
- Trigger: static class string contains all of `flex`, `items-center`, `justify-center`, `min-h-screen`, and `text-center`.
- Allow up to `config.ruleConfig.genericCenteringMaxInstances` (default 1) per file; flag each occurrence beyond the limit.

Create `tests/rules/generic-centering.test.ts`.

---

## Task 5: `logic/boundary-violation`

Create `src/rules/logic/boundary-violation.ts`:

- ID: `logic/boundary-violation`
- Category: `logic`
- Severity: `high`
- AI-specific: true
- Trigger: component has `isServerComponent === true` and any hook call (`useState`, `useEffect`, `useContext`).
- Output one issue per violating component.
- `--fix`: not implemented yet (Phase 5).

Create `tests/rules/boundary-violation.test.ts`.

---

## Task 6: `logic/zombie-state`

Create `src/rules/logic/zombie-state.ts`:

- ID: `logic/zombie-state`
- Category: `logic`
- Severity: `medium`
- AI-specific: true
- Trigger: `useState` binding tuple has both `valueName` and `setterName`, and neither is referenced in the component body.
- Exempt single-value tuples or tuples where either side is referenced.

Create `tests/rules/zombie-state.test.ts`.

---

## Task 7: `logic/ghost-defensive`

Create `src/rules/logic/ghost-defensive.ts`:

- ID: `logic/ghost-defensive`
- Category: `logic`
- Severity: `medium`
- AI-specific: true
- Trigger: `facts.logicalExpressions` contains an entry with `depth >= 3`.
- Output one issue per chain with message including the chain text.

Create `tests/rules/ghost-defensive.test.ts`.

---

## Task 8: `wcag/target-size`

Create `src/rules/wcag/target-size.ts`:

- ID: `wcag/target-size`
- Category: `wcag`
- Severity: `high`
- AI-specific: false
- Trigger: interactive element (`button`, `a`, `input`) has no sizing tokens (`h-*`, `w-*`, `p-*`, `min-w-*`, `min-h-*`, `size-*`) and no explicit `width`/`height` attribute with a non-zero value.
- Skip if any className matches `config.wcag.targetSizeExemptSelectors`.

Create `tests/rules/target-size.test.ts`.

---

## Task 9: `wcag/focus-appearance`

Create `src/rules/wcag/focus-appearance.ts`:

- ID: `wcag/focus-appearance`
- Category: `wcag`
- Severity: `high`
- AI-specific: false
- Trigger: interactive element has an outline-removal class (`outline-none` or `focus:outline-none`) but no focus-ring class (`focus:ring-*`, `focus-visible:ring-*`).

Create `tests/rules/focus-appearance.test.ts`.

---

## Task 10: Registry builtins loader + integration gate

- Create `src/rules/builtins.ts` that imports all seven P0 rules and exports a `builtinRules: Rule[]` array.
- Update `src/rules/registry.ts` so `loadBuiltins()` registers the array.
- Add `tests/rules/registry-integration.test.ts` that calls `loadBuiltins()` and asserts all seven rule IDs are present.
- Run `pnpm typecheck`, `pnpm test`, `pnpm build`. All must pass.

---

## Acceptance Criteria

- All seven P0 rules are registered by default.
- Each rule has passing unit tests for trigger and exemption cases.
- `RuleRegistry.getRules()` returns 7 rules after `loadBuiltins()`.
- `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
