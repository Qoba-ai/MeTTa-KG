// This file was generated by lezer-generator. You probably shouldn't edit it.
import {LRParser} from "@lezer/lr"
const spec_IDENTIFIER = {__proto__:null,"*":64, "/":66, "+":68, "-":70, "%":72, and:74, or:76, not:78, "<":80, ">":82, "<=":84, ">=":86, "==":88, if:90, match:92, empty:94, case:96, let:98, "let*":100, "get-type":102, "get-metatype":104, ":":106, "->":108, "=":110, unify:112, "import!":114, "bind!":116, "new-space":118, "add-atom":120, "remove-atom":122, "pragma!":124, "println!":126, "trace!":128, nop:130, "new-state":132, "get-state":134, "change-state":136, "car-atom":138, "cdr-atom":140, "cons-atom":142, assertEqual:144, assertEqualToResult:146, collapse:148, superpose:150, "load-ascii":152, call:154, regex:156, quote:158, "add-reduct":160, "!":162, Number:164, Bool:166, String:168}
export const parser = LRParser.deserialize({
  version: 14,
  states: "$OQYQPOOOOQO'#Ca'#CaOOQO'#Cc'#CcOOQO'#Ce'#CeOOQO'#Cg'#CgOOQO'#Ci'#CiOOQO'#Ck'#CkOOQO'#Cn'#CnOOQO'#Co'#CoOOQO'#Cp'#CpOOQO'#Cq'#CqOOQO'#Cm'#CmOOQO'#Cr'#CrOOQO'#C`'#C`O%ZQPO'#CuOOQO'#Cv'#CvOOQO'#C_'#C_OOQO'#Cx'#CxQYQPOOOOQO,59a,59aO%bQPO,59aOOQO-E6v-E6vOOQO1G.{1G.{",
  stateData: "%o~OPOSoOS~OUPOWQOYRO[SO^TO`UOh^Ok_OpVOqVOrVOsVOtVOuWOvWOwWOxXOyXOzXO{XO|XO}YO!OYO!PYO!QYO!RYO!SYO!TYO!UYO!VYO!WYO!XYO!YYO!ZYO![YO!]YO!^YO!_YO!`YO!aYO!bYO!cYO!dYO!eYO!fYO!gYO!hYO!iYO!jYO!kYO!lYO!mYO!nYO!oYO!pYO!qYO!rYO!sYO!t[O!u[O!v[O~OgcO~PYOgfO~PYOW[Y^Y~",
  goto: "!bmPPPntzPzPzPzPzPzPz!Q!Q!Q!QzPPttP!WXaO^bdX`O^bdX]O^bdXZO^bdQbOQd^Tebd",
  nodeNames: "⚠ LINE_COMMENT Space Atom Symbol StringLiteral STRING_LITERAL BooleanLiteral BOOLEAN_LITERAL IntegerLiteral INTEGER_LITERAL FloatLiteral FLOAT_LITERAL Identifier IDENTIFIER SpaceReference SPACE_REFERENCE GroundedFunction GroundedArithmeticFunction GroundedBooleanFunction GroundedComparisonFunction OtherGroundedFunction GroundedType CLOSING_PARENTHESIS OPENING_PARENTHESIS Expression Variable VARIABLE",
  maxTerm: 84,
  nodeProps: [
    ["openedBy", 23,"OPENING_PARENTHESIS"],
    ["closedBy", 24,"CLOSING_PARENTHESIS"]
  ],
  skippedNodes: [0,1],
  repeatNodeCount: 1,
  tokenData: "/v~RfXY!gpq!gqr!rrs#gtu$Uvw%lxy'Syz'X|}!r}!O'^!Q![(R![!]!r!]!^)Z!_!`!r!a!b!r!c!h!r!h!i)r!i!v!r!v!w.Q!w!}!r#R#S!r#T#o!r~!lQo~XY!gpq!g~!wY^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#o!r~#jTOr#grs#ys;'S#g;'S;=`$O<%lO#g~$OOU~~$RP;=`<%l#g~$XYqr$w|}$w}!O$w!Q![$w![!]$w!_!`$w!a!b$w!c!}$w#R#S$w#T#o$w~$|Yk~qr$w|}$w}!O$w!Q![$w![!]$w!_!`$w!a!b$w!c!}$w#R#S$w#T#o$w~%oYqr&_|}&_}!O&_!Q![&_![!]&_!_!`&_!a!b&_!c!}&_#R#S&_#T#o&_~&dY`~qr&_|}&_}!O&_!Q![&_![!]&_!_!`&_!a!b&_!c!}&_#R#S&_#T#o&_~'XOh~~'^Og~~'cY^~qr!r|}!r}!O!r!Q![(R![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#o!r~(YZY~^~qr!r|}!r}!O!r!O!P({!Q![(R![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#o!r~)OP!Q![)R~)WP[~!Q![)R~)`SP~OY)ZZ;'S)Z;'S;=`)l<%lO)Z~)oP;=`<%l)Z~)wZ^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#U*j#U#o!r~*o[^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#`!r#`#a+e#a#o!r~+j[^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#g!r#g#h,`#h#o!r~,e[^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#X!r#X#Y-Z#Y#o!r~-bYW~^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#o!r~.V[^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#f!r#f#g.{#g#o!r~/Q[^~qr!r|}!r}!O!r!Q![!r![!]!r!_!`!r!a!b!r!c!}!r#R#S!r#T#i!r#i#j,`#j#o!r",
  tokenizers: [0],
  topRules: {"Space":[0,2]},
  specialized: [{term: 14, get: (value: keyof typeof spec_IDENTIFIER) => spec_IDENTIFIER[value] || -1}],
  tokenPrec: 209
})
