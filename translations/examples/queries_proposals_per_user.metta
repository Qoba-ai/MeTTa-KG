!(import! &self transformed_proposals)


;---- RESULT: (user_id ((roundx num_props) (roundy num_props) ...))

(= (size $l) (foldl-atom $l 0 $x $y (+ $x 1)))


---------------------- USER IDS WITH PER ROUND THE NUMBER OF PROPOSALS THEY SUBMITTED ----------------------------------

(= (user_ids) (unique (match &self ((proposal $p) proposer_id $user_id) $user_id)))
(= (rounds $user_id) (unique (match &self (, ((proposal $p) proposer_id $user_id) ((proposal $p) round_id $round_id)) $round_id)))
(= (proposals_per_round $user_id $round_id) (size (collapse (match &self (, ((proposal $p) proposer_id $user_id) ((proposal $p) round_id $round_id)) $round_id))))

!(let $user_id (user_ids)
     ($user_id (collapse (let $round_id (rounds $user_id)
                    ($round_id (proposals_per_round $user_id $round_id))))))
