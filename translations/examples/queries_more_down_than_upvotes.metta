(import! &self transformed_users)
!(import! &self transformed_comments)
(import! &self transformed_comment_votes)


---------------------------------- UTILITY FUNCTIONS --------------------------------------
; ----- COUNT + TESTS ------
(= (count $l $to_count) (foldl-atom $l 0 $x $y (+ $x (if (== $y $to_count) 1 0))))

; !(count (t t f t f t) t)
; !(count (t t f t f t) f)
; !(count ("t" "t" "f") "f")


; ----- SIZE + TESTS ------
(= (size $l) (foldl-atom $l 0 $x $y (+ $x 1)))
!(size (a a a a a))



-------------------- USERS WITH MORE DOWN- THAN UP-VOTES ON THEIR COMMENTS ----------------

(= (get_num_votes $user_id $vote_type) (size (collapse (match &self (, ((comment $cid) user_id $user_id) ((vote $vid) comment_id $cid) ((vote $vid) vote_type $vote_type)) $cid))))

(= (get_up_votes $user_id) (get_num_votes $user_id "upvote"))
(= (get_down_votes $user_id) (get_num_votes $user_id "downvote"))

----- GET IDS -----
; all ids of user who received more downvotes than upvotes on their comments
!(match &self ((user $i) user_id $id) (if (< (get_up_votes $id) (get_down_votes $id)) $id Empty))

----- GET NAMES -----
; name of users who received downvotes than upvotes on their comments
(match &self ((user $i) user_id $id) (if (< (get_up_votes $id) (get_down_votes $id)) (match &self (, ((user $x) user_id $id) ((user $x) user_name $name)) $name) Empty))


-------------------- USERS WITH MORE DOWN- THAN UP-VOTES ON THEIR COMMENTS - METHOD 2 ----------------

(= (sum $l) (foldl-atom $l 0 $x $y (+ $x $y)))

(= (users_with_comments) (unique (match &self ((comment $c) user_id $user_id) $user_id)))

!(let $user_id (users_with_comments)
    (if (< (sum (collapse (match &self (, ((comment $cid) user_id $user_id) ((comment $cid) comment_votes $cv)) $cv))) 0) $user_id Empty))
