(import /some/space (test abc))
(import /some/space (xyz abc))
(import /some/space (test xyz))
(import /some/space (xyz xyz))

(import /some/other/space (xyz abc))
(import /some/other/space (xyz xyz))


(subtract /some/other/space /some/space)
