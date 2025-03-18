; Don't forget to put exclamation marks before the statements you want to run!
; You can't import all files together, because the data of each file looks similar
; To solve this, we either need to make a different space for each file, or write the query for each file in a different file


(= (transform_ $pattern $query) (match &self $pattern (let $_ (add-atom &self $query) $query)))
(= (transform $pattern $query) (match &self $pattern $query))

;(= (transform__ ($space1 $pattern) ($space2 $query)) (match $space1 $pattern (let $_ (add-atom $space2 $query) $query)))

; ----------------------------------------------- TRANSFORM USERS FILE -------------------------------------------------
(import! &self data_users)

(transform (,
         (time_accessed $t (json $i ($k $v)))
         (time_accessed $t (json $i (user_id $id))))
     (time_accessed $t ((user $id) $k $v))
)


; --------------------------------------------- TRANSFORM COMMENTS FILE ------------------------------------------------

(import! &self data_comments)

; ---- transform that keeps comments ----
; ---- ATTENTION: since comments are long, only part is printed without last quotation marks, if put into MeTTa file, the file is corrupt
; (transform_ (,(time_accessed $t (json $i ($k $v))) (time_accessed $t (json $i (comment_id $id)))) (time_accessed $t ((comment $id) $k $v)))

; ---- transform that removes comments ----
; ---- prevents MeTTa file from being corrupt due to partially printed comments
(match &self (, (time_accessed $t (json $i ($k $v))) (time_accessed $t (json $i (comment_id $id)))) (if (not (== $k content)) (time_accessed $t ((comment $id) $k $v)) Empty))


; ------------------------------------------- TRANSFORM COMMENT_VOTES FILE ---------------------------------------------

(import! &self data_comment_votes)
(transform (, (time_accessed $t (json $i ($k $v)))
                (time_accessed $t (json $i (comment_id $id)))
                (time_accessed $t (json $i (voter_id $id2))))
           (time_accessed $t ((vote $id $id2) $k $v)))

;;; OR OTHER RESULT
;;; ("upvote" 47 "801")
;;; (created_at ("upvote" 47 "801") "2024-12-02 13:53:08")

; (json 0 (voter_id 47))
; (json 0 (comment_id "801"))
; (json 0 (vote_type "upvote"))
; (json 0 (created_at "2024-12-02 13:53:08"))


; (transform_ (, (time_accessed $t (json $i (voter_id $vid))) (time_accessed $t (json $i (comment_id $cid))) (time_accessed $t (json $i (vote_type $vt))) (time_accessed $t (json $i (created_at $date))))
;                (superpose (time_accessed $t (($vt $vid $cid) (created_at ($vt $vid $cid) $date)))))


; ---------------------------------------------- TRANSFORM REVIEWS FILE ------------------------------------------------

(import! &self data_reviews)

; don't use review ids as identifiers because not every review has an id
(transform (time_accessed $t (json $i ($k $v))) (time_accessed $t ((review $i) $k $v)))



; --------------------------------------------- TRANSFORM PROPOSALS FILE -----------------------------------------------

(import! &self data_proposals)

; ---- transform that keeps comments ----
(match &self (,
         (time_accessed $t (json $i ($k $v)))
         (time_accessed $t (json $i (proposal_id $id))))
     (time_accessed $t ((proposal $id) $k $v))
)

; ---- prevents MeTTa file from being corrupt due to partially printed comments
(match &self (,
         (time_accessed $t (json $i ($k $v)))
         (time_accessed $t (json $i (proposal_id $id))))
     (if (not (== $k content)) (time_accessed $t ((proposal $id) $k $v)) Empty)
)


; ----------------------------------------------- TRANSFORM ROUNDS FILE ------------------------------------------------
(import! &self data_rounds)

(match &self (,
         (time_accessed $t (json $i ($k $v)))
         (time_accessed $t (json $i (round_id $id))))
     (time_accessed $t ((round $id) $k $v))
)

; --- ATTENTION the following works exactly because an atom containing a pool id looks like (json 1 (pool_id 0 (id 108)))
; --- which is reduced to (json 1 (pool_id 0 108)), because id is also an identity function
; --- TODO change id to a more suitable keyword
(match &self (,
         (time_accessed $t (json $i (round_id $id)))
         (time_accessed $t (json $i (pool_id $j $pool_id))))
     (time_accessed $t ((round $id) pool_id $pool_id))
)


; --------------------------------------------- TRANSFORM MILESTONES FILE ----------------------------------------------
(import! &self data_milestones)

(transform (time_accessed $t (json $i ($k $v))) (time_accessed $t ((milestone $i) $k $v)))
