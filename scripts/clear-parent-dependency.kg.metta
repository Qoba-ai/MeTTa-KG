; ─── Clear-parent dependency test ────────────────────────────────────────────
; Verifies that a clear of a parent namespace is correctly linked in the
; history graph to earlier writes made into its child namespaces (RULE4).
;
; Scenario:
;   1. Import sensor readings and log events into /data/sensors and /data/logs
;   2. Clear each child space
;   3. In the history graph, each clear must depend on its matching import.
;      Undoing an import should therefore cascade to invalidate its clear.
;
; To exercise undo/redo manually:
;   - Open History, undo the first (import /data/sensors ...) entry
;   - The clear of /data/sensors should also be marked as rolled back
;   - Redo the import; the clear remains invalidated (you must re-clear)

(import /data/sensors (reading temp    22.5))
(import /data/sensors (reading humidity 61))
(import /data/sensors (reading pressure 1013))
(import /data/logs    (event startup     ok))
(import /data/logs    (event calibration ok))
(import /data/logs    (event self-test   ok))

(assert-count /data/sensors 3)
(assert-count /data/logs    3)

; derive a summary in the parent namespace
(transform (in /data/sensors (reading $k $v)) (out /data/summary (sensor $k $v)))
(transform (in /data/logs    (event $name $s)) (out /data/summary (log $name $s)))

(assert-count /data/summary 6)

; clear each child — these ops must appear as dependents of the imports above
(clear /data/sensors)
(clear /data/logs)
(clear /data/summary)

(assert-count /data/sensors 0)
(assert-count /data/logs    0)
(assert-count /data/summary 0)
