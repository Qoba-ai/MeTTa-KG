import { createResource } from 'solid-js';
import { ExploreDetail, exploreSpace } from "~/lib/api"
import parse from 's-expression';
import { EdgeDataDefinition, ElementDefinition, NodeDataDefinition } from 'cytoscape';
import { it } from 'node:test';

interface SpaceNode {
	id: string,
	label: string,
	remoteData: { expr: string, token: Uint8Array },
}

interface SpaceEdge {
	source: SpaceNode["id"]
	target: SpaceNode["id"]
}


function initNode(id: string, label: string, remoteData: { expr: string, token: Uint8Array }): SpaceNode {
	return {
		id,
		label,
		remoteData
	}
}

function initEdge(source: string, target: string): SpaceEdge {
	return {
		source: source,
		target: target
	}
}

// changes backend responses from `/explore` to correct `SpaceNode` representation
// current format is `{token: Uint8Array, expr: string}`
// To be Deprecated
function initNodeFromApiResponse(data: { token: Uint8Array, expr: string }): SpaceNode {
	return initNode(
		tokenToString(data.token),
		extractLabel(data.expr),
		data
	)
}

// changes backend responses from `/explore` to correct `SpaceNode` representation
// current format is `{token: Uint8Array, expr: string}`
function initNodesFromApiResponse(data: { token: Uint8Array, expr: string }[], parentLabel?: string): SpaceNode[] {
	const tokens = data.map((item) => tokenToString(item.token))
	const labels = extractLabels(data).map(item => item || "[Malformed Expr]")

	let nodes = []

	for (let i = 0; i < tokens.length; i++) {
		nodes.push(
			initNode(
				tokens[i],
				labels[i],
				data[i]
			)
		)
	}
	return nodes
}

// changes a token of type Uint8Array to a unique string representation
function tokenToString(token: Uint8Array): string {
	if (token.length === 0) {
		return "-"
	} else {
		return token.join("-")
	}
}

// changes a string to a token of type Uint8Array
function stringToToken(token: string): Uint8Array {
	if (token === "-") {
		return Uint8Array.from([])
	} else {
		return Uint8Array.from(token.split("-").map((item) => parseInt(item)))
	}
}

// Extracts a label from an expression
function extractLabel(expr: string): string {
	return "Expr"
}

function flattenNodes(parsed: any): string[] {
	const nodes: string[] = [];

	function traverse(item: any) {
		if (Array.isArray(item)) {
			item.forEach(traverse);
		} else if (item instanceof String) {
			nodes.push(`'${item}'`); // Convert String object to single-quoted string
		} else if (typeof item === 'string') {
			nodes.push(item);
		}
	}

	traverse(parsed);
	return nodes;
}


function extractLabels(details: ExploreDetail[], parent?: string): (string | null)[] {
	// Helper function to flatten parsed S-expression into a list of nodes

	const flatExprs = details.map(detail => flattenNodes(parse(detail.expr)));

	// Find the maximum length of the flattened expressions
	const maxLength = Math.max(...flatExprs.map(arr => arr.length));

	// loop throught the maxLength build labels
	for (let i = 0; i < maxLength; i++) {
		const column = flatExprs.map(arr => arr[i] || null);

		// Check if column values are identical
		if (column.every(val => val === column[0]))
			continue;

		return column;
	}

	return []
}
window.extractLabels = extractLabels

window.testExtractLabels = [
	{
		expr: `(Head (Date (Value "2007-03-08T23:00:00.000Z")))`,
		token: Uint8Array.from([])
	},
	{
		expr: `(Head (Date (HasDay True)))`,
		token: Uint8Array.from([])
	},
	{
		expr: `(Head (Date (HasYear True)))`,
		token: Uint8Array.from([])
	},
	{
		expr: `(Head (Date (HasMonth True)))`,
		token: Uint8Array.from([])
	},
]


// wraps elements(nodes or edges) insde `data` keys.
// TODO: Deprecate
function elementsToCyInput(eles: SpaceNode[] | SpaceEdge[]): ElementDefinition[] {
	return eles.map((el) => {
		let scratchData = el.remoteData
		el.remoteData = undefined
		return {
			data: el,
			scratch: scratchData
		}
	})
}

function spaceNodeToCyInput(node: SpaceNode): ElementDefinition {
	return {
		data: node,
		scratch: node.remoteData
	}
}

function spaceEdgeToCyInput(edge: SpaceEdge): ElementDefinition {
	return {
		data: edge,
	}
}



export type {
	SpaceNode,
	SpaceEdge,
}

export {
	initNode,
	initEdge,
	initNodeFromApiResponse,
	initNodesFromApiResponse,
	tokenToString,
	stringToToken,
	extractLabel,
	extractLabels,
	flattenNodes,
	elementsToCyInput
}
