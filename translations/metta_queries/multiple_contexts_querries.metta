!(import! &self multiple_contexts)
!(import! &self contexts_person)

!(match &self (@context ($type $link)) $link)

; !(match &self (array $i ($type $value)) (array $i (($type) $value)))
!(match &self (array $i ($type $value)) (array $i ($type ((match &self (@context ($type $link)) $link)) $value)))
