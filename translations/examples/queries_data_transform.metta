; Don't forget to put exclamation marks before the statements you want to run!


(= (transform_ $pattern $query) (match &self $pattern (let $_ (add-atom &self $query) $query)))
(= (transform $pattern $query) (match &self $pattern $query))


; ------- TRANSFORM USERS FILE ------------------------------------------------------
(import! &self data_users)

(transform_ (,
         (json $i ($k $v))
         (json $i (user_id $id)))
     ((user $id) $k $v)
)


; ------- TRANSFORM COMMENTS FILE ---------------------------------------------------

!(import! &self data_comments)

; ---- transform that keeps comments ----
; ---- ATTENTION: since comments are long, only part is printed without last quotation marks, if put into MeTTa file, the file is corrupt
; (transform_ (,(json $i ($k $v)) (json $i (comment_id $id))) ((comment $id) $k $v))

; ---- transform that removes comments ----
; ---- prevents MeTTa file from being corrupt due to partially printed comments
!(match &self (,(json $i ($k $v)) (json $i (comment_id $id))) (if (not (== $k content)) ((comment $id) $k $v) Empty))


; ------- TRANSFORM COMMENT_VOTES FILE ----------------------------------------------

(import! &self data_comment_votes)
; !(transform_ (,(json $i ($k $v)) (json $i (comment_id $id)) (json $i (voter_id $id2))) ((vote $id $id2) $k $v))
;;; OR
; !(transform_ (json $i ($k $v)) ((vote $i) $k $v))
;;; OR OTHER RESULT
;;; ("upvote" 47 "801")
;;; (created_at ("upvote" 47 "801") "2024-12-02 13:53:08")

; (json 0 (voter_id 47))
; (json 0 (comment_id "801"))
; (json 0 (vote_type "upvote"))
; (json 0 (created_at "2024-12-02 13:53:08"))


(transform_ (, (json $i (voter_id $vid)) (json $i (comment_id $cid)) (json $i (vote_type $vt)) (json $i (created_at $date)))
                (superpose (($vt $vid $cid) (created_at ($vt $vid $cid) $date))))