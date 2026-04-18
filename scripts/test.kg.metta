; define backlog
(import /projects/mettakg/todos (BACKEND (1 (ENSURE CONCURRENCY WORKS FLAWLESSLY))))
(import /projects/mettakg/todos (BACKEND (2 (ENSURE TOKENS WORK))))
(import /projects/mettakg/todos (FRONTEND (1 (IMPROVE DESIGN))))

; PM picks top priority items from backlog and adds them to the sprint
(transform (in /projects/mettakg/todos ($type (1 $t))) (out /sprint ($type $t)))

; divide work amongst team
(transform (in /sprint (BACKEND $t)) (out /team/josefien (BACKEND $t)))
(transform (in /sprint (FRONTEND $t)) (out /team/jos (FRONTEND $t)))

; jos got fired! :(, we won't be able to finish his work this sprint, so let's remove it from the sprint
(clear /team/jos)
