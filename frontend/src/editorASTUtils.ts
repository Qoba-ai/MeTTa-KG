/**
 * Utility functions for Editor integration with AST.
 */

import { EditorASTState, astToString, buildASTFromTokens, mergeTokensIntoAST, initializeEditorState } from './ast'

/**
 * Get the displayed content (respecting folds) from AST state.
 */
export function getDisplayContent(astState: EditorASTState): string {
  return astToString(astState.ast)
}

/**
 * Get the original content for diff comparison.
 */
export function getOriginalContent(astState: EditorASTState): string {
  return astToString(astState.originalAST)
}

/**
 * Strip namespace prefix tokens from a list of token paths.
 * e.g. namespace "/test/" → prefix ["test"], strips first token from each path.
 */
export function stripNamespacePrefix(tokenPaths: string[][], namespace: string): string[][] {
  const nsTokens = namespace.replace(/^\/|\/$/g, '').split('/').filter(Boolean)
  if (nsTokens.length === 0) return tokenPaths
  return tokenPaths
    .filter(tp => tp.length > nsTokens.length && tp.slice(0, nsTokens.length).join('/') === nsTokens.join('/'))
    .map(tp => tp.slice(nsTokens.length))
}

/**
 * Create AST state from loaded tokens, stripping namespace prefix if provided.
 */
export function createASTStateFromTokens(tokenPaths: string[][], namespace?: string): EditorASTState {
  const paths = namespace ? stripNamespacePrefix(tokenPaths, namespace) : tokenPaths
  const { ast, nodeMap } = buildASTFromTokens(paths)

  return {
    ast,
    nodeMap,
    expandedPaths: new Set(),
    originalAST: JSON.parse(JSON.stringify(ast)) as typeof ast, // deep copy for original
    originalNodeMap: new Map(nodeMap),
  }
}

/**
 * Expand fringe in AST state by merging new tokens.
 */
export function expandFringeInState(
  astState: EditorASTState,
  fringePath: string,
  newTokens: string[][]
): void {
  mergeTokensIntoAST(astState.ast, astState.nodeMap, fringePath, newTokens)
  astState.expandedPaths.add(fringePath)
}

/**
 * Manually entered content: user types text, parse into AST.
 */
export function parseUserInput(text: string): EditorASTState {
  return initializeEditorState(text)
}
