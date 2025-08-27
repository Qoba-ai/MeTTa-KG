import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { Accessor, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { elementsToCyInput, flattenNodes, initEdge, initNode, initNodesFromApiResponse, SpaceNode } from '~/lib/space';
import { exploreSpace } from '~/lib/api';
import { formatedNamespace, namespace } from '~/lib/state';
import parse from 's-expression';

cytoscape.use(coseBilkent);

export type CytoscapeCanvasHandle = {
	zoomIn: () => void;
	zoomOut: () => void;
	recenter: () => void;
	// applyLayout: () => void;
	// stopLayout: () => void;
	// setShowLabels: (show: boolean) => void;
	// exportPNG: () => void;
	// exportPDF: () => void;
};

interface SpaceGraphProps {
	pattern: Accessor<string>;
	rootNodes: Accessor<SpaceNode[]>;
	onZoomChange?: (zoom: number) => void;
	ref?: (cavas: CytoscapeCanvasHandle, setSpaceGraph: (eles: SpaceNode[]) => void) => void;
}

const SpaceGraph = (props: SpaceGraphProps) => {
	let cyContainer: HTMLDivElement;
	let cy: cytoscape.Core;
	const [initNodes, setInitNodes] = createSignal(props.rootNodes());
	const [rootNode, setRootNode] = createSignal(initRootNode(""))

	createEffect(() => {
		setInitNodes(props.rootNodes());
		if (cy) {
			cy.destroy();
		}
		setSpaceGraph();
	})

	function setSpaceGraph() {
		cy = cytoscape({
			container: cyContainer!,
			zoom: 1.5,
			elements: [
				rootNode(),
				...elementsToCyInput(initNodes()),  // nodes
				...elementsToCyInput(initNodes().map(node => initEdge(rootNode().data.id!, node.id)))],  // edges to root
			style: [
				{
					selector: 'node',
					style: {
						'background-color': graphColors.nodeBackground,
						'label': 'data(label)',
						'color': graphColors.nodeText,
						'font-size': 7,
						'font-weight': 5000,
						'font-family': "ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji",
						'text-valign': 'center',
						'text-halign': 'center',
						'text-wrap': 'wrap',
						'text-max-width': '30px',
						'width': 40,
						'height': 40,
						'shape': 'ellipse',
						'border-width': 0,
						'transition-property': 'background-color, border-width, width, height',
						'transition-duration': 0.2
					},
				},
				{
					selector: 'edge',
					style: {
						width: 1,
						'line-color': graphColors.edge,
						'target-arrow-color': graphColors.edgeArrow,
						'target-arrow-shape': 'triangle',
					},
				},
			],
			layout: {
				name: 'cose-bilkent',
				animate: false,
				fit: false
			} as any,
		});
		recenter()

		cy.on('tap', 'node', (event) => {
			const node = event.target;
			if (node.successors().length > 0) {
				collapseNode(node);
			} else {
				expandNode(node);
			}
		});
	}

	function initRootNode(pattern: string): cytoscape.ElementDefinition {
		let node = elementsToCyInput(
			[
				initNode(
					"root",
					"",
					{ token: Uint8Array.from([]), expr: pattern })
			]
		)[0];
		node.style = { "background-color": "blue" };
		return node;
	}

	const fetchChildren = async (node: cytoscape.NodeSingular): Promise<[SpaceNode[], boolean]> => {
		let children = JSON.parse(await exploreSpace(formatedNamespace(), props.pattern(), node.scratch().token) as any);
		//children = Array.from(children)
		//children = children.map(item => { return item.token})
		const newNodes = initNodesFromApiResponse(children);
		const expr: string = node.scratch().expr;

		if (newNodes.length > 0) {
			return [newNodes, false];
		}

		if (newNodes.length === 0 && expr && expr.trim() !== "") {
			// if no children are found, and the node is root (no expr) -j
			// return the child of the tapped node
			let flatNodes = flattenNodes(parse(expr));

			let valueNode = initNode(
				node.id() + "-value",
				flatNodes[flatNodes.length - 1] || "[Malformed Expr]",
				{ token: Uint8Array.from([-1]), expr: ""}
			)
			return [[valueNode], true]
		}

		return [[], false];


	}

	const runLayout = () => {
		const layout = cy.layout({
			name: 'cose-bilkent',
			animate: true,
			fit: false,
		} as any);
		layout.run();
	}

	const collapseNode = (node: cytoscape.NodeSingular) => {
		const children = node.outgoers();
		if (children.length > 0) {
			//node.data('collapsed', true);
			children.forEach(child => {
				child.data('originalPosition', { ...child.position() });
			});
			children.animate({
				position: node.position(),
				style: { opacity: 0 },
				duration: 200,
				easing: 'ease-in-out-sine',
				complete: () => {
					children.style({ display: 'none' });
					//children.remove()
					node.successors().remove()
					//edges.remove()
					runLayout();
				}
			})
		};
	}

	const expandNode = async (node: cytoscape.NodeSingular) => {
		fetchChildren(node).then(([newNodes, isValueNode]) => {
			const newEdges = newNodes.map(newNode => initEdge(node.id(), newNode.id));
			const graphNodes = elementsToCyInput(newNodes)
			const graphEdges = elementsToCyInput(newEdges)
			graphNodes.forEach(n => n.position = { x: node.position().x, y: node.position().y })

			if (isValueNode) {
				graphNodes.forEach(n => n.style = { "background-color": "purple" });
			}

			cy.add(graphNodes);
			cy.add(graphEdges);
			runLayout();
		}).catch(err => {
			console.error("Failed to fetch children: ", err);
		});
	};


function zoomIn() {
	if (cy && !cy.animated()) {
		const currentZoom = cy.zoom();
		cy.animate({
			zoom: {
				level: Math.min(currentZoom * 1.2, 4),
				renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
			}
		}, {
			duration: 300,
			easing: 'ease-out'
		});
	}
};

function zoomOut() {
	if (cy && !cy.animated()) {
		const currentZoom = cy.zoom();
		cy.animate({
			zoom: {
				level: Math.max(currentZoom * 0.8, 0.2),
				renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
			}
		}, {
			duration: 300,
			easing: 'ease-out'
		});
	}
};

function recenter() {
	if (cy) {
		cy.animate({
			fit: { eles: cy.elements(), padding: 200 }
		}, {
			duration: 500,
			easing: 'ease-in-out'
		});
	}
};

const graphColors = {
	nodeBackground: '#21C45D',
	nodeBackgroundHover: '#5a87ff',
	nodeBackgroundSelected: '#3a6bff',

	nodeText: '#e7ecf9',
	edge: '#7aa2ff',
	edgeArrow: '#7aa2ff',
};

onMount(() => {
	props.ref?.({
		zoomIn,
		zoomOut,
		recenter,
		// applyLayout,
		// stopLayout,
		// setShowLabels,
		// exportPNG,
		// exportPDF,
	}, setSpaceGraph);

});

onCleanup(() => {
	if (cy) {
		cy.destroy();
	}
});

return <div class="w-full h-full" ref={cyContainer!} />;
};

export default SpaceGraph;