; ─── Supply chain ────────────────────────────────────────────────────────────
; Model a warehouse → orders → fulfilment → dispatch pipeline.
; Tests: imports across sibling namespaces, multi-step routing transforms,
;        assert-count, clear of a single lane, re-routing after correction.

; warehouse stock levels
(import /warehouse (stock widget 100))
(import /warehouse (stock gadget 50))
(import /warehouse (stock doohickey 200))

; incoming customer orders
(import /orders (order o1 widget 10))
(import /orders (order o2 gadget 5))
(import /orders (order o3 widget 25))
(import /orders (order o4 doohickey 80))
(import /orders (order o5 gadget 12))

; route each order into the correct fulfilment lane by item type
(transform (in /orders (order $id widget $qty))    (out /fulfilment/widget    (pick $id $qty)))
(transform (in /orders (order $id gadget $qty))    (out /fulfilment/gadget    (pick $id $qty)))
(transform (in /orders (order $id doohickey $qty)) (out /fulfilment/doohickey (pick $id $qty)))

; widget lane has exactly 2 picks, gadget lane has 2, doohickey lane has 1
(assert-count /fulfilment/widget 2)
(assert-count /fulfilment/gadget 2)
(assert-count /fulfilment/doohickey 1)

; oops — the gadget supplier is out of stock; cancel those picks and requeue
(clear /fulfilment/gadget)
(assert-count /fulfilment/gadget 0)
(import /orders (order o6 widget 3))
(transform (in /orders (order o6 widget $qty)) (out /fulfilment/widget (pick o6 $qty)))

; roll all picks up into a single dispatch queue
(transform (in /fulfilment/widget    (pick $id $qty)) (out /dispatch (ship $id widget    $qty)))
(transform (in /fulfilment/doohickey (pick $id $qty)) (out /dispatch (ship $id doohickey $qty)))

; 3 widget picks + 1 doohickey pick = 4 dispatch entries
(assert-count /dispatch 4)

(explore /dispatch)
