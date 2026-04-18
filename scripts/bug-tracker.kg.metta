; ─── Bug tracker ─────────────────────────────────────────────────────────────
; Simulate a bug lifecycle: triage → assign → fix → close.
; Tests: multi-stage pipeline using transforms, selective clear with pattern,
;        assert-count at each stage.

; clear to start fresh
(clear /)

; setup role mapping
(import /roles (senior critical))
(import /roles (mid major))
(import /roles (junior minor))

; ── triage: new bugs land in /bugs/inbox ─────────────────────────────────────
(import /bugs/inbox (bug b001 critical (login fails on Safari)))
(import /bugs/inbox (bug b002 minor    (tooltip misaligned)))
(import /bugs/inbox (bug b003 critical (data loss on save)))
(import /bugs/inbox (bug b004 minor    (wrong colour on button)))
(import /bugs/inbox (bug b005 major    (search returns stale results)))

(assert-count /bugs/inbox 5)
(assert-count /bugs/assigned 0)
(assert-count /bugs/resolved 0)
(assert-count /bugs/closed 0)

; ── assign: critical bugs go to senior team, others to junior ────────────────
(transform
  (in /roles ($role $urgency))
  (in /bugs/inbox (bug $id $urgency $desc)) 
  (out /bugs/assigned (assigned $id $role $desc)))

(subtract 
  (in /bugs/assigned (assigned $id $role $desc)) 
  (in /roles ($role $urgency)) 
  (out /bugs/inbox (bug $id $urgency $desc)))

(assert-count /bugs/inbox 0)
(assert-count /bugs/assigned 5)
(assert-count /bugs/resolved 0)
(assert-count /bugs/closed 0)

; ── fix: senior resolves their bugs ──────────────────────────────────────────
(transform
  (in /bugs/assigned (assigned $id senior $desc))
  (out /bugs/resolved (resolved $id $desc)))

(subtract 
  (in /bugs/resolved (resolved $id $desc)) 
  (in /bugs/assigned (assigned $id $role $desc)) 
  (out /bugs/assigned (assigned $id $role $desc)))

(assert-count /bugs/inbox 0)
(assert-count /bugs/assigned 3)
(assert-count /bugs/resolved 2)
(assert-count /bugs/closed 0)

; ── close: move resolved bugs to archive ─────────────────────────────────────
(transform
  (in /bugs/resolved (resolved $id $desc))
  (out /bugs/closed (closed $id $desc)))

(subtract 
  (in /bugs/closed (closed $id $desc))
  (out /bugs/resolved (resolved $id $desc)))

(assert-count /bugs/inbox 0)
(assert-count /bugs/assigned 3)
(assert-count /bugs/resolved 0)
(assert-count /bugs/closed 2)

(explore /bugs/closed)
(explore /bugs/assigned)
