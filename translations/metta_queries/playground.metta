(A loves B)
(X loves Y)

!(== (match &self ($x loves B) $x) (empty))
!(if (match &self ($x loves Z) $x) True False)