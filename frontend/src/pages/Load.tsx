import MettaEditor from "~/components/space/MettaEditor"
import UIControls from "~/components/controls/UIControls"
import ZoomControls from "~/components/controls/ZoomControls"
import MinimizeControls from "~/components/controls/MinimizeControls"
import CytoscapeCanvas from "~/components/Canvas/CytoscapeCanvas"
import { createResource, For, Show, Suspense, createSignal } from 'solid-js';
import { readSpace, exploreSpace } from "~/lib/api"
import { ParseError, LayoutAlgorithm, LayoutOptions, LayoutState } from '../types';
import { HiOutlineMinus, HiOutlinePlus } from 'solid-icons/hi';

// Import the required CSS for the editor
import '../styles/variables.css';
import '../styles/components.css';

const LoadPage = () => {

	//const [space] = createResource("/", async (source) => {
	//	return await readSpace(source)
	//});

	const [subSpace] = createResource("/", async (source) => {
		let res = await exploreSpace(source, "$x", {
			expr: "$x",
			token: Uint8Array.from([2])
		})
		res = JSON.parse(res)
		res.forEach((each: any) => {
			console.log("token: ", each.token)
			console.log("expr: ", each.expr)
		})
		return res
	})

    // Editor state
    const [mettaText, setMettaText] = createSignal('; Sample Metta Code\n(gender Chandler M)\n(age Alice 25)\n(is-brother John Adam)');
    const [parseErrors, setParseErrors] = createSignal<ParseError[]>([]);
    const [isMinimized, setIsMinimized] = createSignal(false);
    
    // UI Controls state
    const [isControlsMinimized, setIsControlsMinimized] = createSignal(false);
    const [showLabels, setShowLabels] = createSignal(true);
    const [layoutState, setLayoutState] = createSignal<LayoutState>({
        isAnimating: false,
        progress: 0,
        algorithm: 'force-directed',
        startTime: 0,
        duration: 0
    });

    let progressTimer: number | undefined;

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
        console.log('Editor text changed:', text);
    };

    const handleFileUpload = (file: File) => {
        console.log('File uploaded:', file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setMettaText(content);
        };
        reader.readAsText(file);
    };

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized());
    };

    const toggleControlsMinimize = () => {
        setIsControlsMinimized(!isControlsMinimized());
    };

    // UI Controls event handlers
    const handleApplyLayout = (algorithm: LayoutAlgorithm, options?: LayoutOptions) => {
        console.log('Apply layout:', algorithm, options);
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
        console.log('Stop layout');
        (window as any).cytoscapeControls?.stopLayout();
        setLayoutState(prev => ({
            ...prev,
            isAnimating: false
        }));
        stopProgressSim();
    };

    const handleExportPDF = () => {
        console.log('Export PDF');
        (window as any).cytoscapeControls?.exportPDF(2);
    };

    const handleExportPNG = () => {
        console.log('Export PNG');
        (window as any).cytoscapeControls?.exportPNG(2);
    };

    const handleToggleLabels = (show: boolean) => {
        setShowLabels(show);
        (window as any).cytoscapeControls?.setShowLabels(show);
    };

    // Zoom Controls event handlers
    const handleZoomIn = () => {
        console.log('Zoom in');
        (window as any).cytoscapeControls?.zoomIn();
    };

    const handleZoomOut = () => {
        console.log('Zoom out');
        (window as any).cytoscapeControls?.zoomOut();
    };

    const handleRecenter = () => {
        console.log('Recenter');
        (window as any).cytoscapeControls?.recenter();
    };

    // Minimize Controls event handlers
    const handleMinimizeAll = () => {
        console.log('Minimize all');
        setIsMinimized(true);
        setIsControlsMinimized(true);
    };

    const handleMaximizeAll = () => {
        console.log('Maximize all');
        setIsMinimized(false);
        setIsControlsMinimized(false);
    };

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
    const cleanup = setupEventListeners();

    return (
        <div class="relative w-full h-full">
            {/* MettaEditor - Always floating on the left */}
            <div class={`ui-card ${isMinimized() ? 'minimized' : 'metta-editor-card'} top-left`} style={isMinimized() ? "width: 300px; height: auto; z-index: 1001;" : ""}>
                <div class="card-header">
                    <h3>MeTTa Editor</h3>
                    <button class="minimize-btn" onClick={toggleMinimize}>
                        {isMinimized() ? <HiOutlinePlus class="w-4 h-4" /> : <HiOutlineMinus class="w-4 h-4" />}
                    </button>
                </div>
                
                <Show when={!isMinimized()}>
                    <div class="card-content">
                        <MettaEditor
                            initialText={mettaText()}
                            onTextChange={handleTextChange}
                            onFileUpload={handleFileUpload}
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
                onMinimizeAll={handleMinimizeAll}
                onMaximizeAll={handleMaximizeAll}
            />

            {/* UI Controls - Floating on bottom right */}
            <div class={`ui-card ${isControlsMinimized() ? 'minimized' : ''} bottom-right-lower`} style={isControlsMinimized() ? "width: 200px; height: auto; z-index: 1001;" : ""}>
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
            </div>

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
                        <CytoscapeCanvas
                            data={subSpace()}
                            className="w-full h-full"
                        />
                    </Show>
                </Suspense>
            </div>

            {/* Data Panel - Optional overlay for debugging */}
            <Show when={subSpace() && subSpace()!.length > 0}>
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