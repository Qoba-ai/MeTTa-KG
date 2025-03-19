!(import! &self mock_data_multiple_versions)

; a MeTTa graph database can contain different versions of the database overtime, each atom labeled with a timestamp
; This method gets the latest timestamp on which the database was retrieved, thus the latest version of the database
(= (newest_time) (let $times (collapse (match &self (time_accessed $t $data) $t)) (max-atom $times)))

; get all atoms of the latest version of the database
!(let $t (newest_time) (match &self (time_accessed $t $x) $x))
