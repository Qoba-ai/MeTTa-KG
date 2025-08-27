import MettaEditor from "~/components/space/MettaEditor"
import UIControls from "~/components/controls/UIControls"
import ZoomControls from "~/components/controls/ZoomControls"
import MinimizeControls from "~/components/controls/MinimizeControls"
import SpaceGraph from '~/components/space/SpaceGraph'
import { For, Show, Suspense, createEffect, createResource, createSignal } from 'solid-js';
import { ParseError, LayoutAlgorithm, LayoutOptions, LayoutState } from '../types';
import { HiOutlineMinus, HiOutlinePlus } from 'solid-icons/hi';
import { initNode, initNodesFromApiResponse, SpaceNode, subSpace } from "~/lib/space"
import CytoscapeCanvas, { CytoscapeCanvasHandle } from "~/components/space/SpaceGraph";

// Import the required CSS for the editor
import '../styles/variables.css';
import '../styles/components.css';
import { exploreSpace } from "~/lib/api"
import { namespace } from "~/lib/state"

const LoadPage = () => {
	// Editor state
	const [mettaText, setMettaText] = createSignal('$x');
	const [parseErrors, setParseErrors] = createSignal<ParseError[]>([]);
	const [isMinimized, setIsMinimized] = createSignal(true);
	const [pattern, setPattern] = createSignal("$x");

	// UI Controls state
	const [isControlsMinimized, setIsControlsMinimized] = createSignal(true);
	const [showLabels, setShowLabels] = createSignal(true);
	const [layoutState, setLayoutState] = createSignal<LayoutState>({
		isAnimating: false,
		progress: 0,
		algorithm: 'force-directed',
		startTime: 0,
		duration: 0
	});
	let canvas!: CytoscapeCanvasHandle;
	let setSpaceGraph: (eles: SpaceNode[]) => void;
	const rootNode: SpaceNode = initNode("root", "", { token: Uint8Array.from([]), expr: "" })
	let progressTimer: number | undefined;

	const [newNodeLabel, setNewNodeLabel] = createSignal("");

	const [subSpace] = createResource(
		() => ({
			path: namespace(),	
			expr: pattern(),
			token: Uint8Array.from([])
		}),
		async ({ path, expr, token }) => { // Destructure the object
			let pathStr = `/${path.join("/")}`
			let res = await exploreSpace(pathStr, expr, token);
			res = JSON.parse(res as any);
			return res;
		}
	);

	createEffect(() => {
		if (subSpace() && setSpaceGraph) {
			setSpaceGraph(initNodesFromApiResponse(subSpace()!));
		}
	})


	const handleNewNodeLabelChange = (e: any) => {
		setNewNodeLabel(e.target.value);
	};

	const handleAddNewNode = (e: any) => {
		if (e.key === 'Enter') {
			const labels = newNodeLabel().split('\n').filter(label => label.trim() !== '');
			// @ts-ignore
			window.newNodes = labels.map(label => initNode(label, label));
			setNewNodeLabel("");
		}
	};

	const startProgressSim = (durationMs = 1500) => {
		stopProgressSim();
		const start = performance.now();
		const tick = (t: number) => {
			const elapsed = t - start;
			const p = Math.min(0.98, elapsed / durationMs);
			setLayoutState(prev => ({ ...prev, progress: p }));
			if (p < 0.98 && layoutState().isAnimating) {
				progressTimer = requestAnimationFrame(tick) as unknown as number;
			}
		};
		progressTimer = requestAnimationFrame(tick) as unknown as number;
	};

	const stopProgressSim = () => {
		if (progressTimer) cancelAnimationFrame(progressTimer);
		progressTimer = undefined;
	};

	// Editor event handlers
	const handleTextChange = (text: string) => {
		setMettaText(text);
	};

	function handlePatternLoad(pattern: string) {
		setPattern(pattern)
	};

	const toggleMinimize = () => {
		setIsMinimized(!isMinimized());
	};

	const toggleControlsMinimize = () => {
		setIsControlsMinimized(!isControlsMinimized());
	};

	// UI Controls event handlers
	const handleApplyLayout = (algorithm: LayoutAlgorithm, options?: LayoutOptions) => {
		// Call Cytoscape
		(window as any).cytoscapeControls?.applyLayout(algorithm, options);

		setLayoutState(prev => ({
			...prev,
			isAnimating: true,
			algorithm,
			startTime: Date.now(),
			duration: options?.animationDuration || 1500,
			progress: 0
		}));
		startProgressSim(options?.animationDuration || 1500);
	};

	const handleStopLayout = () => {
		(window as any).cytoscapeControls?.stopLayout();
		setLayoutState(prev => ({
			...prev,
			isAnimating: false
		}));
		stopProgressSim();
	};

	const handleExportPDF = () => {
		(window as any).cytoscapeControls?.exportPDF(2);
	};

	const handleExportPNG = () => {
		(window as any).cytoscapeControls?.exportPNG(2);
	};

	const handleToggleLabels = (show: boolean) => {
		setShowLabels(show);
		(window as any).cytoscapeControls?.setShowLabels(show);
	};

	// Zoom Controls event handlers
	function handleZoomIn() {
		canvas.zoomIn();
	};

	function handleZoomOut() {
		canvas.zoomOut();
	};

	const handleRecenter = () => {
		canvas.recenter();
	};

	// Minimize Controls event handlers
	const handleMinimizeAll = () => {
		setIsMinimized(true);
		setIsControlsMinimized(true);
	};

	const handleMaximizeAll = () => {
		setIsMinimized(false);
		setIsControlsMinimized(false);
	};

	function handleToggleCard() {
		if (isMinimized()) {
			handleMaximizeAll()
		} else {
			handleMinimizeAll()
		}
	}

	// Layout event listeners
	const handleLayoutStart = (e: Event) => {
		const detail = (e as CustomEvent).detail || {};
		setLayoutState(prev => ({
			...prev,
			algorithm: detail.algorithm ?? prev.algorithm,
			isAnimating: true,
			progress: 0
		}));
	};

	const handleLayoutStop = () => {
		stopProgressSim();
		setLayoutState(prev => ({ ...prev, isAnimating: false, progress: 1 }));
		setTimeout(() => setLayoutState(prev => ({ ...prev, progress: 0 })), 500);
	};

	// Add event listeners when component mounts
	const setupEventListeners = () => {
		window.addEventListener('cy:layoutstart', handleLayoutStart);
		window.addEventListener('cy:layoutstop', handleLayoutStop);

		// Cleanup function
		return () => {
			window.removeEventListener('cy:layoutstart', handleLayoutStart);
			window.removeEventListener('cy:layoutstop', handleLayoutStop);
			stopProgressSim();
		};
	};

	// Setup event listeners on mount
	//const cleanup = setupEventListeners();
	return (
		<div class="relative w-full h-full">
			{/* MettaEditor - Always floating on the left */}
			<div class={`ui-card ${isMinimized() ? 'minimized' : 'metta-editor-card'} top-left`} style={isMinimized() ? "width: 300px; height: auto; z-index: 1001;" : ""}>
				<div class="card-header">
					<h3>Pattern</h3>
					<button class="minimize-btn" onClick={toggleMinimize}>
						{isMinimized() ? <HiOutlinePlus class="w-4 h-4" /> : <HiOutlineMinus class="w-4 h-4" />}
					</button>
				</div>

				<Show when={!isMinimized()}>
					<div class="card-content">
						<MettaEditor
							initialText={mettaText()}
							onTextChange={handleTextChange}
							onPatternLoad={handlePatternLoad}
							parseErrors={parseErrors()}
						/>
					</div>
				</Show>
			</div>

			{/* Zoom Controls - Top Right */}
			<ZoomControls
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onRecenter={handleRecenter}
			/>

			{/* Minimize Controls - Top Right Secondary (next to zoom controls) */}
			<MinimizeControls
				onToggleCards={handleToggleCard}
			/>

			{/* UI Controls - Floating on bottom right */}
			{/* <div class={`ui-card ${isControlsMinimized() ? 'minimized' : ''} bottom-right-lower`} style={isControlsMinimized() ? "width: 200px; height: auto; z-index: 1001;" : ""}>
				<div class="card-header">
					<h3>Controls</h3>
					<button class="minimize-btn" onClick={toggleControlsMinimize}>
						{isControlsMinimized() ? <HiOutlinePlus class="w-4 h-4" /> : <HiOutlineMinus class="w-4 h-4" />}
					</button>
				</div>

				<Show when={!isControlsMinimized()}>
					<div class="card-content">
						<UIControls
							onExportPDF={handleExportPDF}
							onExportPNG={handleExportPNG}
							showLabels={showLabels()}
							onToggleLabels={handleToggleLabels}
							onApplyLayout={handleApplyLayout}
							layoutState={layoutState()}
							onStopLayout={handleStopLayout}
						/>
					</div>
				</Show>
			</div> */}

			{/* Cytoscape Canvas - Main Background */}
			<div class="absolute inset-0 w-full h-full" style="z-index: 0;">
				<Suspense fallback={
					<div class="flex items-center justify-center h-full" style="color: hsl(var(--muted-foreground));">
						<div class="text-lg">Loading graph...</div>
					</div>
				}>
					<Show when={subSpace()} fallback={
						<div class="flex items-center justify-center h-full" style="color: hsl(var(--destructive));">
							<div class="text-center p-8">
								<div class="text-lg mb-2">Error loading space data</div>
								<div class="text-sm opacity-70">Check server logs for details</div>
							</div>
						</div>
					}>
						<Show when={subSpace()!.length > 0} fallback={
							<div class="flex items-center justify-center h-full" style="color: hsl(var(--muted-foreground));">
								<span class="text-lg">No data loaded on this path/namespace</span>
							</div>
						}>
							<SpaceGraph pattern={pattern} rootNodes={() => initNodesFromApiResponse(subSpace()!)} ref={(c, s) => {
								canvas = c
								setSpaceGraph = s
							}} />
						</Show>

					</Show>
				</Suspense>
			</div>

			{/* Data Panel - Optional overlay for debugging */}
			<Show when={false}>
				<div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 max-w-lg" style="z-index: 500;">
					<div class="space-data-item opacity-90 backdrop-blur-sm">
						<div class="text-xs font-semibold mb-2" style="color: hsl(var(--muted-foreground));">
							Graph Data ({subSpace()!.length} items)
						</div>
						<div class="max-h-20 overflow-y-auto">
							<For each={subSpace()!.slice(0, 3)}>
								{(item) => (
									<div class="text-xs mb-1">
										<span class="expression-value">{item.expr}</span>
									</div>
								)}
							</For>
							{subSpace()!.length > 3 && (
								<div class="text-xs opacity-60">...and {subSpace()!.length - 3} more</div>
							)}
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
};

export default LoadPage;
