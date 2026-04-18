; ─── Knowledge base ──────────────────────────────────────────────────────────
; Build a simple taxonomy of animals, then classify instances and derive
; properties through a chain of transforms.
; Tests: deep namespace hierarchy, pattern-variable binding, chained inference.

; ── taxonomy (is-a hierarchy) ────────────────────────────────────────────────
(import /kb/taxonomy (isa dog      mammal))
(import /kb/taxonomy (isa cat      mammal))
(import /kb/taxonomy (isa eagle    bird))
(import /kb/taxonomy (isa penguin  bird))
(import /kb/taxonomy (isa salmon   fish))
(import /kb/taxonomy (isa mammal   animal))
(import /kb/taxonomy (isa bird     animal))
(import /kb/taxonomy (isa fish     animal))

; ── properties of broad classes ──────────────────────────────────────────────
(import /kb/properties (has mammal  warm-blooded true))
(import /kb/properties (has bird    warm-blooded true))
(import /kb/properties (has fish    warm-blooded false))
(import /kb/properties (has bird    can-fly      true))
(import /kb/properties (has penguin can-fly      false))
(import /kb/properties (has mammal  has-fur      true))

; ── instances ────────────────────────────────────────────────────────────────
(import /kb/instances (instance rex    dog))
(import /kb/instances (instance fluffy cat))
(import /kb/instances (instance sam    salmon))
(import /kb/instances (instance eddie  eagle))
(import /kb/instances (instance pip    penguin))

; ── derive: every instance inherits its genus ────────────────────────────────
(transform
  (in /kb/instances (instance $name $species))
  (out /kb/derived (member-of $name $species)))

; ── derive: tag each instance with its broad class ───────────────────────────
(transform
  (in /kb/instances (instance $name $species))
  (out /kb/derived (member-of $name $species)))

; ── spot-check counts ────────────────────────────────────────────────────────
(assert-count /kb/taxonomy  > 0)
(assert-count /kb/instances 5)

; ── explore derived facts ────────────────────────────────────────────────────
(explore /kb/derived)
(explore /kb/taxonomy)
