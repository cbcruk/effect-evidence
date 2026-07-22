# Replacement techniques

Four ways to replace an unnecessary `useEffect`. They are **not** interchangeable —
each preserves a different intent. The blueprint narrows the choice; the source and
the human settle it. Recipes below, then a chooser.

## 1. Render-time compute — for derived state

**When:** the effect only reads reactive values (state/props/derived), does a
`setState`, touches nothing external, and isn't scheduled. The state it sets is just
a function of other state.

**Why it's better:** an effect that sets derived state runs an extra render pass and
can desync (the derived value is briefly stale). Computing during render is always
consistent and needs no effect, no extra state.

```tsx
// before
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// after — no state, no effect
const fullName = firstName + ' ' + lastName;
```

Wrap in `useMemo` only if the computation is genuinely expensive — not by default.

## 2. Event handler — for logic that responds to a specific interaction

**When:** the "cause" is a user action (click, submit, change), not the component
rendering. In the blueprint this often shows up as a `setState` sitting in an effect
that really fires in response to one specific thing, or a scheduled write tied to an
event.

**Why it's better:** effects run because of *rendering with certain deps*, which is
the wrong cause for "the user did X." Putting the logic in the handler makes the
cause explicit and avoids re-firing when unrelated deps change.

```tsx
// before — POST fires whenever `submitted` flips, an indirect cause
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (submitted) post('/api/register', form);
}, [submitted]);

// after — the cause is the submit
function handleSubmit() {
  post('/api/register', form);
}
```

## 3. `useSyncExternalStore` — for subscribing to an external store

**When:** the effect subscribes to something outside React (a browser API, a
non-React store, an event source) and mirrors it into state. Blueprint shows
`addEventListener` / `subscribe` plus a `setState`.

**Why it's better:** the purpose-built hook handles tearing, SSR, and the
subscribe/getSnapshot lifecycle that a hand-rolled effect gets subtly wrong.

```tsx
// before
const [online, setOnline] = useState(true);
useEffect(() => {
  const on = () => setOnline(true), off = () => setOnline(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}, []);

// after
const online = useSyncExternalStore(
  (cb) => {
    window.addEventListener('online', cb);
    window.addEventListener('offline', cb);
    return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
  },
  () => navigator.onLine,
  () => true,
);
```

## 4. `key` reset — for "reset state when a prop changes"

**When:** the effect exists to reset local state when some identity (a `userId`, a
route param) changes. Blueprint shows a `setState` back to an initial value keyed on
a prop in deps.

**Why it's better:** remounting via `key` resets *all* local state atomically and
declaratively, instead of an effect that resets fields one by one and runs a frame late.

```tsx
// before — effect resets a field when userId changes
useEffect(() => { setComment(''); }, [userId]);

// after — parent gives the subtree a key; React remounts it fresh
<Profile key={userId} userId={userId} />
```

## Choosing between them

Ask what the effect's real *cause* is:

- **"It's a function of other state"** → render-time compute (1). No cause at all; it's derived.
- **"A specific user interaction"** → event handler (2). The cause is the event, not rendering.
- **"Something outside React changed"** → `useSyncExternalStore` (3). External source of truth.
- **"An identity changed and this state should start over"** → `key` reset (4).

If two seem to fit, you probably haven't found the real cause yet — look again at
what actually triggers the state change, and ask the human if the source is silent.
These map to the cases in React's "You Might Not Need an Effect"; the React compiler's
`validate_no_derived_computations_in_effects` is the precise detector for case 1.
