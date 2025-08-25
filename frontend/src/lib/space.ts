import { createResource } from 'solid-js';
import { ExploreDetail, exploreSpace } from "~/lib/api"
import parse from 's-expression';
import { EdgeDataDefinition, ElementDefinition, NodeDataDefinition } from 'cytoscape';

interface SpaceNode {
	id: string,
	label: string,
	remoteData: { expr: string, token: Uint8Array },
}

interface SpaceEdge {
	source: SpaceNode["id"]
	target: SpaceNode["id"]
}


function initNode(id: string, label: string, remoteData?: any): SpaceNode {
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
function initNodesFromApiResponse(data: { token: Uint8Array, expr: string }[]): SpaceNode[] {
	const tokens = data.map((item) => tokenToString(item.token))
	const labels = extractLabels(data)
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


function extractLabels(details: ExploreDetail[]): string[] {
	// Helper function to flatten parsed S-expression into a list of nodes
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

	// Parse and flatten all expressions
	const parsedExpressions = details.map(d => {
		try {
			const parsed = parse(d.expr);
			return flattenNodes(parsed);
		} catch (error) {
			console.warn(`Failed to parse expression "${d}": ${error.message}`);
			return null; // Use null to indicate malformed
		}
	});

	// Initialize result array
	const result: string[] = details.map((_, i) => {
		if (parsedExpressions[i] === null) {
			return '[Malformed]';
		}
		return '';
	});

	// Find the maximum length of nodes across valid expressions
	const validParsed = parsedExpressions.filter(nodes => nodes !== null) as string[][];
	if (validParsed.length === 0) {
		return result;
	}
	const maxLength = Math.max(...validParsed.map(nodes => nodes.length));

	// Check if all valid expressions are identical
	const allIdentical = validParsed.every(nodes =>
		nodes.length === validParsed[0].length &&
		nodes.every((node, pos) => node === validParsed[0][pos])
	);

	if (allIdentical) {
		const lastNode = validParsed[0].length > 0 ? validParsed[0][validParsed[0].length - 1] : '';
		details.forEach((_, i) => {
			if (parsedExpressions[i] !== null) {
				result[i] = lastNode;
			}
		});
		return result;
	}

	// Compare nodes at each position for non-identical cases
	for (let pos = 0; pos < maxLength; pos++) {
		const nodesAtPos = parsedExpressions.map(nodes => nodes !== null ? (nodes[pos] || '') : '');
		const uniqueNodes = new Set(nodesAtPos.filter(node => node !== ''));

		// If all nodes at this position are the same (or empty), continue to next position
		if (uniqueNodes.size <= 1) continue;

		// For each expression, check if the node at this position is unique
		for (let i = 0; i < details.length; i++) {
			if (result[i] === '' && nodesAtPos[i]) {
				// Check if this node is unique among others at this position
				const isUnique = parsedExpressions.every((nodes, j) => {
					if (i === j || nodes === null) return true;
					return (nodes[pos] || '') !== nodesAtPos[i];
				});
				if (isUnique) {
					result[i] = nodesAtPos[i];
				}
			}
		}

		// If all expressions have a unique node, we can stop
		if (result.every(node => node !== '' || parsedExpressions[result.indexOf(node)] === null)) break;
	}

	// For expressions without a unique node, use the first non-common node if available
	for (let i = 0; i < details.length; i++) {
		if (result[i] === '' && parsedExpressions[i] !== null) {
			const nodes = parsedExpressions[i] as string[];
			for (let pos = 0; pos < nodes.length; pos++) {
				const isCommon = parsedExpressions.every((otherNodes, j) => {
					if (i === j || otherNodes === null) return true;
					return (otherNodes[pos] || '') === nodes[pos];
				});
				if (!isCommon && nodes[pos]) {
					result[i] = nodes[pos];
					break;
				}
			}
			// If still empty (all common, but since not all identical, this shouldn't happen), set to last
			if (result[i] === '') {
				result[i] = nodes.length > 0 ? nodes[nodes.length - 1] : '';
			}
		}
	}

	return result;
}

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
	subSpace,
	initNode,
	initEdge,
	initNodeFromApiResponse,
	initNodesFromApiResponse,
	tokenToString,
	stringToToken,
	extractLabel,
	extractLabels,
	elementsToCyInput
}
