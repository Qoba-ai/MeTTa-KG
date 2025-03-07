!(import! &self transformed_proposals)
(import! &self transformed_users)
!(bind! &user_awarded (new-space))

(= (max $l) ((py-atom max) (py-list $l)))
(= (size $l) ((py-atom len) (py-list $l)))

(= (users_with_awarded_projects) (unique (match &self (, ((proposal $p) proposer_id $user_id) ((proposal $p) is_awarded True)) $user_id)))
(= (awarded_projects $user_id) (match &self (, ((proposal $p) proposer_id $user_id) ((proposal $p) is_awarded True)) $p))


----- MAKE SPACE OF (user_id number_awarded_proposals)
!(let $user_id (users_with_awarded_projects) (add-atom &user_awarded ($user_id (size (collapse (awarded_projects $user_id))))))

----- GET IDS OF USERS WITH MOST AWARDED PROPOSALS -----
!(let $max_awarded (max (collapse (match &user_awarded ($k $v) $v)))
                   (match &user_awarded ($user_id $y) (if (== $max_awarded $y) $user_id Empty)))


----- GET NAMES OF USERS WITH MOST AWARDED PROPOSALS -----
(let $max_awarded (max (collapse (match &user_awarded ($k $v) $v)))
                   (match &user_awarded ($user_id $y) (if (== $max_awarded $y) (match &self (, ((user $i) user_id $user_id) ((user $i) user_name $name)) $name) Empty)))
