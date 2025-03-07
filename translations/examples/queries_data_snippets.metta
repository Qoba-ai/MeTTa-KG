!(import! &self transformed_users)
!(import! &self transformed_comments)
!(import! &self transformed_comment_votes)
!(import! &self transformed_comment_votes2)
!(import! &self transformed_proposals)


; ------------------------ GENERATE DATA SNIPPETS --------------------------------------
; --- USERS ----------------------------------------------------------------------------
!(USERS)
!(match &self ((user 238) $x $y) ((user 238) $x $y))
!(match &self ((user 626) $x $y) ((user 626) $x $y))
!(match &self ((user 1101) $x $y) ((user 1101) $x $y))
!(match &self ((user 1541) $x $y) ((user 1541) $x $y))

; --- COMMENTS -------------------------------------------------------------------------
!(COMMENTS)
!(match &self ((comment "1") $x $y) ((comment "1") $x $y))
!(match &self ((comment "2") $x $y) ((comment "2") $x $y))
!(match &self ((comment "3") $x $y) ((comment "3") $x $y))
!(match &self ((comment "4") $x $y) ((comment "4") $x $y))

; --- COMMENT VOTES 1 ------------------------------------------------------------------
!(COMMENT VOTES 1)
!(match &self ((vote 1) $x $y) ((vote 1) $x $y))
!(match &self ((vote 2) $x $y) ((vote 2) $x $y))
!(match &self ((vote 3) $x $y) ((vote 3) $x $y))
!(match &self ((vote 4) $x $y) ((vote 4) $x $y))

; --- COMMENT VOTES 2 ------------------------------------------------------------------
!(COMMENT VOTES 2)
!(match &self (, ($vote_type $voter_id "801") (created_at ($vote_type $voter_id "801") $date)) (superpose (($vote_type $voter_id "1") (created_at ($vote_type $voter_id "1") $date))))
!(match &self (, ($vote_type $voter_id "234") (created_at ($vote_type $voter_id "234") $date)) (superpose (($vote_type $voter_id "1") (created_at ($vote_type $voter_id "1") $date))))


; --- PROPOSALS -------------------------------------------------------------------------
!(PROPOSALS)
!(match &self ((proposal 5923) $x $y) ((proposal 5923) $x $y))
!(match &self ((proposal 3062) $x $y) ((proposal 3062) $x $y))
!(match &self ((proposal 8957) $x $y) ((proposal 8957) $x $y))
!(match &self ((proposal 3128) $x $y) ((proposal 3128) $x $y))
