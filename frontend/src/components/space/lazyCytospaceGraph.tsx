import { createSignal, onMount, onCleanup } from 'solid-js';
import cytoscape, {
	Core,
	NodeSingular,
	NodeDefinition,
	EdgeSingular,
	ElementsDefinition,
	StylesheetCSS,
	EdgeCollection,
	CollectionArgument,
	ElementDefinition,
	Position
} from 'cytoscape';
import { SpaceEdge, SpaceNode, subSpace } from '~/lib/space';


interface LazyCytoscapeGraphProps {
	initNodes?: SpaceNode[]
	initEdges?: SpaceEdge[]
}

export function LazyCytoscapeGraph(props: LazyCytoscapeGraphProps) {
	let cyContainer: HTMLDivElement | undefined;
	let cyInstance: Core | undefined;
	const [collapsedNodes, setCollapsedNodes] = createSignal<Map<string, { nodes: ElementDefinition[], edges: ElementDefinition[], originalPositions: Record<string, Position> }>>(
		new Map()
	);

	const initNodes = props.initNodes || [
		{ id: '-' },
		{ id: 'bird' },
		{ id: 'ladybug' },
		{ id: 'aphid' },
		{ id: 'rose' },
		{ id: 'grasshopper' },
		{ id: 'plant' },
		{ id: 'wheat' }
	] as SpaceNode[]
	const initEdges = props.initEdges || [
		{ source: '-', target: 'bird' },
		{ source: 'bird', target: 'ladybug' },
		{ source: 'bird', target: 'grasshopper' },
		{ source: 'grasshopper', target: 'plant' },
		{ source: 'grasshopper', target: 'wheat' },
		{ source: 'ladybug', target: 'aphid' },
		{ source: 'aphid', target: 'rose' }
	] as SpaceEdge[]

	const [nodes, setNodes] = createSignal(initNodes.map((n) => {
		return {
			data: { id: n.id }
		} as NodeDefinition
	}))


	//{ data: { source: 'cat', target: 'bird' } },
	const [edges, setEdges] = createSignal(initEdges.map((n) => {
		return {
			data: { source: n.source, target: n.target }
		}
	}))

	onMount(() => {
		if (!cyContainer) {
			console.error('Cytoscape container element not found');
			return;
		}

		cyInstance = cytoscape({
			container: cyContainer,
			boxSelectionEnabled: false,
			autounselectify: true,
			autoungrabify: true, // Disable node dragging

			style: [
				{
					selector: 'node',
					css: {
						height: 80,
						width: 80,
						'background-color': '#21C45D',
						label: 'data(id)',
						display: "flex",
						"text-valign": "center",
						"test-halign": "center",
						color: "white"


					}
				},
				{
					selector: '.eating',
					css: {
						'border-color': '#21C45D'
					}
				},
				{
					selector: '.eater',
					css: {
						'border-width': 1
					}
				},
				{
					selector: 'edge',
					css: {
						'curve-style': 'bezier',
						width: 2,
						'target-arrow-shape': 'triangle',
						'line-color': 'white',
						'target-arrow-color': 'white'
					}
				}
			] as StylesheetCSS[],

			elements: {
				nodes: nodes(),
				edges: edges()
			} as ElementsDefinition,

			layout: {
				name: 'breadthfirst',
				directed: true,
				padding: 10
			}
		});

		const handleTap = function(this: NodeSingular, evt: cytoscape.EventObject) {
			// Prevent default drag behavior
			evt.preventDefault();

			const tapped: NodeSingular = this;
			const nodeId = tapped.id();
			let nodes: CollectionArgument = tapped;

			// Access the reactive collapsedNodes map
			const currentCollapsed = collapsedNodes();

			if (currentCollapsed.has(nodeId)) {
				// Expand: Restore nodes first, then edges with animation
				const elementsToRestore = currentCollapsed.get(nodeId)!;

				// Add nodes at tapped position with small size and opacity 0
				const initialPos = tapped.position();
				const tempNodeDefs = elementsToRestore.nodes.map(def => ({ ...def, position: { ...initialPos } }));
				const addedNodes = cyInstance!.add(tempNodeDefs);
				addedNodes.style({ width: 10, height: 10, opacity: 0 });

				// Add edges after nodes to ensure targets exist
				const addedEdges = cyInstance!.add(elementsToRestore.edges);
				addedEdges.style('opacity', 0);

				// Update the reactive state (remove from collapsed)
				setCollapsedNodes((prev) => {
					const newMap = new Map(prev);
					newMap.delete(nodeId);
					return newMap;
				});

				tapped.removeClass('eater eating');

				// Animate expansion in reverse order with stagger
				let delay = 0;
				const duration = 150;
				const stagger = 50; // Overlap animations for faster overall effect
				for (let i = elementsToRestore.nodes.length - 1; i >= 0; i--) {
					(function() {
						const restoredNodeId = elementsToRestore.nodes[i].data.id;
						const node: NodeSingular = addedNodes.filter(`[id = "${restoredNodeId}"]`).first() as NodeSingular;
						const originalPos = elementsToRestore.originalPositions[restoredNodeId];
						const incomingEdge: EdgeCollection = node.incomers('edge');

						node.delay(delay).animate({
							position: originalPos,
							style: {
								width: 80,
								height: 80,
								opacity: 1
							}
						}, {
							duration: duration,
							easing: 'ease-in-out'
						});

						incomingEdge.delay(delay).animate({
							style: {
								opacity: 1,
								width: 2
							}
						}, {
							duration: duration,
							easing: 'ease-in-out'
						});

						delay += stagger;
					})();
				}
			} else {
				const node: NodeSingular[] = [];
				const nodeEdges: EdgeSingular[] = [];

				nodes.addClass('eater');

				for (; ;) {
					const connectedEdges: EdgeCollection = nodes.connectedEdges(function(el: EdgeSingular) {
						return !el.target().anySame(nodes as CollectionArgument);
					});

					const connectedNodes = connectedEdges.targets() as NodeSingular[];
					nodeEdges.push(...connectedEdges);

					Array.prototype.push.apply(node, connectedNodes);

					nodes = connectedNodes;

					if (nodes.empty()) { break; }
				}

				// Store original positions
				const originalPositions: Record<string, Position> = {};
				node.forEach(node => {
					originalPositions[node.id()] = { ...node.position() };
				});

				// Store the elements to be removed
				const elementsToRemove = {
					nodes: node.map(node => ({ group: 'nodes', data: node.data() })),
					edges: nodeEdges.map(edge => ({ group: 'edges', data: edge.data() })),
					originalPositions
				};

				// Update the reactive state
				setCollapsedNodes((prev) => {
					const newMap = new Map(prev);
					newMap.set(nodeId, elementsToRemove);
					return newMap;
				});

				let delay: number = 0;
				const duration: number = 150;
				const stagger = 50; // Overlap animations for faster overall effect
				for (let i = node.length - 1; i >= 0; i--) {
					(function() {
						const thisFood: NodeSingular = node[i];
						const eater: NodeSingular = thisFood.connectedEdges(function(el: EdgeSingular) {
							return el.target().same(thisFood);
						}).source() as NodeSingular;
						const incomingEdge: EdgeCollection = thisFood.connectedEdges(function(el: EdgeSingular) {
							return el.target().same(thisFood);
						});

						thisFood.delay(delay, function() {
							eater.addClass('eating');
						}).animate({
							position: eater.position(),
							style: {
								width: 10,
								height: 10,
								'border-width': 0,
								opacity: 0
							}
						}, {
							duration: duration,
							easing: 'ease-in-out',
							complete: function() {
								thisFood.remove();
							}
						});

						incomingEdge.delay(delay).animate({
							style: {
								opacity: 0,
								width: 0
							}
						}, {
							duration: duration,
							easing: 'ease-in-out',
							complete: function() {
								incomingEdge.remove();
							}
						});

						delay += stagger;
					})();
				}
			}
		};

		// Register the tap event
		cyInstance.on('tap', 'node', handleTap);

		// Cleanup on component unmount
		onCleanup(() => {
			if (cyInstance) {
				cyInstance.off('tap', 'node', handleTap);
				cyInstance.destroy();
			}
		});
	});

	return <div ref={cyContainer} id="cy" class="w-full h-full" />;
};
