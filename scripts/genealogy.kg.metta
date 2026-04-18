; ─── Genealogy ───────────────────────────────────────────────────────────────
; Build a family tree, then derive additional facts via transforms.
; Tests: import into multiple subspaces, chained transforms, assert-count,
;        explore.

; raw parent → child facts
(import /family/raw (parent alice carol))
(import /family/raw (parent alice dave))
(import /family/raw (parent bob carol))
(import /family/raw (parent bob dave))
(import /family/raw (parent carol eve))
(import /family/raw (parent carol frank))
(import /family/raw (parent dave grace))

; project alice's direct children into their own space
(transform (in /family/raw (parent alice $child)) (out /family/alice $child))

; every child is also a person; every parent is also a person
(transform (in /family/raw (parent $_ $child))  (out /family/people (person $child)))
(transform (in /family/raw (parent $parent $_)) (out /family/people (person $parent)))

; mark anyone who appears as a parent as having that role
(transform (in /family/raw (parent $p $_)) (out /family/roles (role $p parent)))

; how many unique people did we derive?
(count /family/people)

; alice should have exactly 2 children
(assert-count /family/alice 2)

; there should be at least one parent role recorded
(assert-count /family/roles > 0)

; inspect the derived people list
(explore /family/people)
