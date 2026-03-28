/**
 * AST (Abstract Syntax Tree) based representation of MeTTa content.
 * All editor operations (folding, diff, rendering) work on this AST.
 */

// ============ Core Node Types ============

export interface BaseNode {
  id: string
  source: 'manual' | 'loaded'
}

export interface AtomNode extends BaseNode {
  type: 'atom'
  value: string
  kind?: 'symbol' | 'number' | 'string' | 'variable'
}

export interface ExprNode extends BaseNode {
  type: 'expr'
  key: string
  children: ASTNode[]
  expandedFrom?: string  // fringePath this atom was added from expand, used for re-collapse
}

export interface FringeNode extends BaseNode {
  type: 'fringe'
  path: string
  source: 'loaded'
}

export type ASTNode = AtomNode | ExprNode | FringeNode
export type ASTDocument = ASTNode[]

// ============ Editor State ============

export interface EditorASTState {
  ast: ASTDocument
  nodeMap: Map<string, ASTNode>
  expandedPaths: Set<string>
  originalAST: ASTDocument
  originalNodeMap: Map<string, ASTNode>
}

// ============ Utilities ============

let idCounter = 0
export function generateId(): string {
  return `node_${++idCounter}`
}

export function nodeId(node: ASTNode): string {
  return node.id
}

// ============ Parser: S-expression String → AST ============

/**
 * Parse MeTTa S-expression strings into AST.
 * Example: "(a (b c))" → ExprNode with key "a" and one child ExprNode with key "b"
 */
export function parseTokensToAST(tokens: string[], source: 'manual' | 'loaded' = 'manual'): ASTNode | null {
  if (tokens.length === 0) return null

  const [token, ...rest] = tokens

  if (token === '(') {
    // It's an expression: find the matching close paren
    let depth = 1
    let endIdx = 1
    while (endIdx < rest.length && depth > 0) {
      if (rest[endIdx] === '(') depth++
      else if (rest[endIdx] === ')') depth--
      endIdx++
    }

    if (depth !== 0) return null // mismatched

    const exprTokens = rest.slice(0, endIdx - 1)
    if (exprTokens.length === 0) return null

    const keyToken = exprTokens[0]
    const bodyTokens = exprTokens.slice(1)

    const key = keyToken.replace(/^"|"$/g, '')
    const children: ASTNode[] = []

    // Parse body recursively
    let idx = 0
    while (idx < bodyTokens.length) {
      const bodyToken = bodyTokens[idx]

      if (bodyToken === '(') {
        // Find matching close
        let d = 1
        let endI = idx + 1
        while (endI < bodyTokens.length && d > 0) {
          if (bodyTokens[endI] === '(') d++
          else if (bodyTokens[endI] === ')') d--
          endI++
        }
        const child = parseTokensToAST(bodyTokens.slice(idx, endI), source)
        if (child) children.push(child)
        idx = endI
      } else if (bodyToken !== ')') {
        // It's an atom
        const child = createAtom(bodyToken, source)
        if (child) children.push(child)
        idx++
      } else {
        idx++
      }
    }

    return {
      type: 'expr',
      key,
      children,
      id: generateId(),
      source,
    }
  } else if (token === '$') {
    // Fringe marker
    return {
      type: 'fringe',
      path: '',
      id: generateId(),
      source: 'loaded',
    }
  } else {
    // It's an atom
    return createAtom(token, source)
  }
}

function createAtom(value: string, source: 'manual' | 'loaded'): AtomNode {
  const cleanValue = value.replace(/^"|"$/g, '')
  let kind: AtomNode['kind'] = 'symbol'

  if (/^-?\d+(\.\d+)?$/.test(cleanValue)) {
    kind = 'number'
  } else if (/^\$/.test(cleanValue)) {
    kind = 'variable'
  } else if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
    kind = 'string'
  }

  return {
    type: 'atom',
    value: cleanValue,
    kind,
    id: generateId(),
    source,
  }
}

// Parse a complete MeTTa string into AST document
export function parseMeTTaString(content: string, source: 'manual' | 'loaded' = 'manual'): ASTDocument {
  const tokens = tokenize(content)
  const ast: ASTNode[] = []

  let idx = 0
  while (idx < tokens.length) {
    const token = tokens[idx]

    if (token === '(') {
      let depth = 1
      let endIdx = idx + 1
      while (endIdx < tokens.length && depth > 0) {
        if (tokens[endIdx] === '(') depth++
        else if (tokens[endIdx] === ')') depth--
        endIdx++
      }
      const node = parseTokensToAST(tokens.slice(idx, endIdx), source)
      if (node) ast.push(node)
      idx = endIdx
    } else if (token !== '' && token !== '\n') {
      const node = createAtom(token, source)
      ast.push(node)
      idx++
    } else {
      idx++
    }
  }

  return ast
}

function tokenize(s: string): string[] {
  return s.match(/\(|\)|"[^"]*"|[^\s()]+/g) || []
}

// ============ Serializer: AST → String ============

/**
 * Convert AST back to MeTTa string.
 */
export function astToString(ast: ASTDocument, nodeMap?: Map<string, ASTNode>): string {
  return ast.map(node => nodeToString(node, nodeMap)).filter(s => s.length > 0).join('\n')
}

function nodeToString(node: ASTNode, nodeMap?: Map<string, ASTNode>): string {
  if (node.type === 'atom') {
    return node.value
  } else if (node.type === 'fringe') {
    return '$'
  } else if (node.type === 'expr') {
    const childStrs = node.children.map(c => nodeToString(c, nodeMap)).filter(s => s.length > 0)
    if (childStrs.length === 0) {
      return `(${node.key})`
    }
    return `(${node.key} ${childStrs.join(' ')})`
  }
  return ''
}

// ============ AST Manipulation ============

/**
 * Build initial AST from explore tokens.
 * Tokens are path arrays like [["a", "b", "c"], ["a", "b", "d"], ...]
 * Merge into a single tree structure.
 */
export function buildASTFromTokens(tokenPaths: string[][]): { ast: ASTDocument; nodeMap: Map<string, ASTNode> } {
  const nodeMap = new Map<string, ASTNode>()
  const atoms: ASTNode[] = []

  const fringePaths = tokenPaths.filter(tp => tp.length > 0 && tp[tp.length - 1] === '$')

  // Build a nested atom from a terminal path: ["a", "b"] → ExprNode("a", [AtomNode("b")])
  function buildAtomFromPath(tokens: string[]): ASTNode {
    if (tokens.length === 1) {
      const atom: AtomNode = { type: 'atom', value: tokens[0], kind: 'symbol', id: generateId(), source: 'loaded' }
      nodeMap.set(atom.id, atom)
      return atom
    }
    const inner = buildAtomFromPath(tokens.slice(1))
    const expr: ExprNode = { type: 'expr', key: tokens[0], children: [inner], id: generateId(), source: 'loaded' }
    nodeMap.set(expr.id, expr)
    return expr
  }

  // Build a nested fringe atom from path tokens (without the "$"):
  // ["a"] → ExprNode("a", [FringeNode{path:"a"}])
  // ["greger", "greegr"] → ExprNode("greger", [ExprNode("greegr", [FringeNode{path:"greger/greegr"}])])
  function buildFringeFromPath(tokensBeforeDollar: string[]): ASTNode {
    const path = tokensBeforeDollar.join('/')
    const fringe: FringeNode = { type: 'fringe', path, id: generateId(), source: 'loaded' }
    nodeMap.set(fringe.id, fringe)
    let current: ASTNode = fringe
    for (let i = tokensBeforeDollar.length - 1; i >= 0; i--) {
      const expr: ExprNode = { type: 'expr', key: tokensBeforeDollar[i], children: [current], id: generateId(), source: 'loaded' }
      nodeMap.set(expr.id, expr)
      current = expr
    }
    return current
  }

  // Count fringe paths per first key (for consolidation decision)
  const fringeCountByFirstKey = new Map<string, number>()
  for (const tp of fringePaths) {
    fringeCountByFirstKey.set(tp[0], (fringeCountByFirstKey.get(tp[0]) ?? 0) + 1)
  }

  // Process all paths in order: terminals added immediately, fringes consolidated at first occurrence
  const emittedFringeKeys = new Set<string>()
  for (const tp of tokenPaths) {
    if (tp.length === 0) continue
    const isFringe = tp[tp.length - 1] === '$'
    if (isFringe) {
      const key = tp[0]
      if (!emittedFringeKeys.has(key)) {
        emittedFringeKeys.add(key)
        if ((fringeCountByFirstKey.get(key) ?? 0) >= 2) {
          // Multiple fringe paths for this key → consolidate to (key $)
          atoms.push(buildFringeFromPath([key]))
        } else {
          // Single fringe path → show full nested path e.g. (greger (greegr $))
          atoms.push(buildFringeFromPath(tp.slice(0, -1)))
        }
      }
    } else {
      atoms.push(buildAtomFromPath(tp))
    }
  }

  return { ast: atoms, nodeMap }
}

/**
 * Merge new explore results into existing AST (flat list).
 * fringePath identifies which fringe to expand (e.g. "a" or "greger/greegr").
 * Finds the top-level atom containing a FringeNode with that path, removes it,
 * and inserts new atoms built from newTokens.
 * newTokens must already have the namespace prefix stripped.
 */
export function mergeTokensIntoAST(
  ast: ASTDocument,
  nodeMap: Map<string, ASTNode>,
  fringePath: string,
  newTokens: string[][]
): void {
  function hasDescendantFringe(node: ASTNode, path: string): boolean {
    if (node.type === 'fringe') return (node as FringeNode).path === path
    if (node.type === 'expr') {
      const exprNode = node as ExprNode
      // After parseMeTTaString re-parses editor content, $ appears as AtomNode
      if (exprNode.key === path && exprNode.children.some(c => c.type === 'atom' && (c as AtomNode).value === '$')) return true
      return exprNode.children.some(c => hasDescendantFringe(c, path))
    }
    return false
  }

  function removeNodesFromMap(node: ASTNode): void {
    nodeMap.delete(node.id)
    if (node.type === 'expr') (node as ExprNode).children.forEach(c => removeNodesFromMap(c))
  }

  function addToNodeMap(node: ASTNode): void {
    nodeMap.set(node.id, node)
    if (node.type === 'expr') (node as ExprNode).children.forEach(addToNodeMap)
  }

  // Find the top-level atom containing the fringe
  const idx = ast.findIndex(n => hasDescendantFringe(n, fringePath))
  if (idx === -1) return

  // Remove the old atom from nodeMap
  removeNodesFromMap(ast[idx])

  // Build new atoms from newTokens
  const { ast: newAtoms } = buildASTFromTokens(newTokens)

  // Deduplicate: skip atoms whose serialized form already exists in the AST
  const existingStrings = new Set<string>()
  for (let i = 0; i < ast.length; i++) {
    if (i !== idx) existingStrings.add(astToString([ast[i]]))
  }

  const uniqueNewAtoms: ASTNode[] = []
  for (const a of newAtoms) {
    const s = astToString([a])
    if (!existingStrings.has(s)) {
      if (a.type === 'expr') (a as ExprNode).expandedFrom = fringePath
      uniqueNewAtoms.push(a)
      existingStrings.add(s)
    }
  }

  for (const a of uniqueNewAtoms) addToNodeMap(a)
  ast.splice(idx, 1, ...uniqueNewAtoms)
}

export function unexpandFringe(
  ast: ASTDocument,
  nodeMap: Map<string, ASTNode>,
  fringePath: string
): void {
  function removeNodesFromMap(node: ASTNode): void {
    nodeMap.delete(node.id)
    if (node.type === 'expr') (node as ExprNode).children.forEach(c => removeNodesFromMap(c))
  }

  const toRemove: number[] = []
  for (let i = 0; i < ast.length; i++) {
    const n = ast[i]
    if (n.type === 'expr') {
      const ep = (n as ExprNode).expandedFrom
      if (ep && (ep === fringePath || ep.startsWith(fringePath + '/'))) {
        toRemove.push(i)
      }
    }
  }

  if (toRemove.length === 0) return

  const insertIdx = toRemove[0]
  for (let i = toRemove.length - 1; i >= 0; i--) {
    removeNodesFromMap(ast[toRemove[i]])
    ast.splice(toRemove[i], 1)
  }

  const { ast: fringeAtoms, nodeMap: fringeNodeMap } = buildASTFromTokens([[...fringePath.split('/'), '$']])
  for (const [id, node] of fringeNodeMap) nodeMap.set(id, node)
  ast.splice(insertIdx, 0, ...fringeAtoms)
}


// ============ Folding Operations ============

/**
 * Check if a node at a given path in the AST is a fringe node (contains a $ child).
 */
export function hasFringeDescendant(nodes: ASTNode[], relPath: string): boolean {
  const parts = relPath.split('/').filter(Boolean)
  let current: ASTNode[] = nodes

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const found = current.find(n => n.type === 'expr' && (n as ExprNode).key === part)
    if (!found) return false
    if (i === parts.length - 1) {
      return (found as ExprNode).children.some(c => c.type === 'fringe' || (c.type === 'atom' && (c as AtomNode).value === '$'))
    }
    current = (found as ExprNode).children
  }
  return false
}

// ============ Diff Computation ============

export interface DiffInfo {
  nodeId: string
  status: 'new' | 'modified' | 'unchanged'
}

/**
 * Compute diff between current and original AST.
 * Returns map of node id → status.
 */
export function computeDiff(ast: ASTDocument, originalAST: ASTDocument): Map<string, DiffInfo['status']> {
  const diff = new Map<string, DiffInfo['status']>()

  // Simple approach: nodes with source='manual' are new/modified
  function traverse(nodes: ASTNode[]) {
    for (const node of nodes) {
      if (node.source === 'manual') {
        diff.set(node.id, 'new')
      } else {
        diff.set(node.id, 'unchanged')
      }

      if (node.type === 'expr') {
        traverse((node as ExprNode).children)
      }
    }
  }

  traverse(ast)
  return diff
}

// ============ State Management ============

/**
 * Initialize editor state from loaded content.
 */
export function initializeEditorState(content: string): EditorASTState {
  const ast = parseMeTTaString(content, 'loaded')
  const nodeMap = new Map<string, ASTNode>()
  buildNodeMap(ast, nodeMap)

  return {
    ast,
    nodeMap,
    expandedPaths: new Set(),
    originalAST: ast,
    originalNodeMap: new Map(nodeMap),
  }
}

function buildNodeMap(ast: ASTDocument, nodeMap: Map<string, ASTNode>): void {
  for (const node of ast) {
    nodeMap.set(node.id, node)
    if (node.type === 'expr') {
      buildNodeMap((node as ExprNode).children, nodeMap)
    }
  }
}

/**
 * Create a new empty state.
 */
export function emptyEditorState(): EditorASTState {
  return {
    ast: [],
    nodeMap: new Map(),
    expandedPaths: new Set(),
    originalAST: [],
    originalNodeMap: new Map(),
  }
}
