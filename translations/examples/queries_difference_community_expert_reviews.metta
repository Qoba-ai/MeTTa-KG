!(import! &self transformed_reviews)
(import! &self transformed_proposals)


(match &self ((review $i) overall_rating $x) $x)

(= (max $l) (foldl-atom $l 0 $x $y (if (> $x $y) $x $y)))
(= (min $l) (foldl-atom $l 5.0 $x $y (if (< $x $y) $x $y)))
(= (sum $l) (foldl-atom $l 0 $x $y (+ $x $y)))
;(= (avg $l) (let $size (size-atom $l) (if (== $size 0) () (/ (sum $l) $size))))
(= (avg $l) (/ (sum $l) (size-atom $l)))
(avg (1.0 5.2 3.6))
(avg ())

(= (get_com_ratings $proposal_id) (match &self (, ((review $i) proposal_id $proposal_id) ((review $i) overall_rating $rating) ((review $i) review_type "community")) $rating))
(= (get_exp_ratings $proposal_id) (match &self (, ((review $i) proposal_id $proposal_id) ((review $i) overall_rating $rating) ((review $i) review_type "expert")) $rating))


(match &self (, ((review $i) overall_rating $rating) ((review $i) review_type "community")) $rating)

; all proposal_ids of proposals that have reviews
(unique (match &self ((review $i) proposal_id $prop_id) $prop_id))

; all proposal_ids of proposals that have both expert and community reviews
(= (prop_ids) (unique (match &self (, ((review $i) proposal_id $prop_id)
                                      ((review $j) proposal_id $prop_id)
                                      ((review $i) review_type "community")
                                      ((review $j) review_type "expert")) $prop_id)))



--- FOR EACH PROPOSAL THAT HAS BOTH EXPERT AND COMMUNITY REVIEWS, THE DIFFERENCE BETWEEN THE TWO
(let* (($proposal_id (prop_ids))
        ($community_rating (avg (collapse (match &self (, ((review $i) proposal_id $proposal_id)
                                            ((review $i) review_type "community")
                                            ((review $i) overall_rating $rating)
                                          ) $rating))))
        ($expert_rating (avg (collapse (match &self (, ((review $i) proposal_id $proposal_id)
                                            ((review $i) review_type "expert")
                                            ((review $i) overall_rating $rating)
                                          ) $rating)))))
       ($proposal_id (- $expert_rating $community_rating)))


--- THE BIGGEST DIFFERENCE BETWEEN EXPERT AND COMMUNITY REVIEWS OVER ALL PROPOSALS
!(let $diff (collapse (abs-math (let* (($proposal_id (prop_ids))
        ($community_rating (avg (collapse (match &self (, ((review $i) proposal_id $proposal_id)
                                            ((review $i) review_type "community")
                                            ((review $i) overall_rating $rating)
                                          ) $rating))))
        ($expert_rating (avg (collapse (match &self (, ((review $i) proposal_id $proposal_id)
                                            ((review $i) review_type "expert")
                                            ((review $i) overall_rating $rating)
                                          ) $rating)))))
       (- $expert_rating $community_rating)))) (max-atom $diff))