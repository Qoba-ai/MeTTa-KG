import MettaEditor from "~/components/space/MettaEditor"
import UIControls from "~/components/controls/UIControls"
import ZoomControls from "~/components/controls/ZoomControls"
import MinimizeControls from "~/components/controls/MinimizeControls"
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
        setLayoutState(prev => ({
            ...prev,
            isAnimating: true,
            algorithm,
            startTime: Date.now(),
            duration: options?.animationDuration || 1500
        }));
        
        // Simulate layout animation
        setTimeout(() => {
            setLayoutState(prev => ({
                ...prev,
                isAnimating: false,
                progress: 1
            }));
        }, options?.animationDuration || 1500);
    };

    const handleStopLayout = () => {
        console.log('Stop layout');
        setLayoutState(prev => ({
            ...prev,
            isAnimating: false
        }));
    };

    const handleExportPDF = () => {
        console.log('Export PDF');
    };

    const handleExportPNG = () => {
        console.log('Export PNG');
    };

    // Zoom Controls event handlers
    const handleZoomIn = () => {
        console.log('Zoom in');
    };

    const handleZoomOut = () => {
        console.log('Zoom out');
    };

    const handleRecenter = () => {
        console.log('Recenter');
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
                            onToggleLabels={setShowLabels}
                            onApplyLayout={handleApplyLayout}
                            layoutState={layoutState()}
                            onStopLayout={handleStopLayout}
                        />
                    </div>
                </Show>
            </div>

            {/* Background Component - Full Screen */}
            <div class="w-full h-full p-4" style="background: hsl(var(--background)); transition: background-color 0.3s ease;">
                <Suspense fallback={<div class="loading-message">Loading...</div>}>
                    <Show when={subSpace()} fallback={<div class="error-message">Error when loading space. Check mork server logs.</div>}>
                        <div class="flex flex-col gap-4">
                            <h2 class="text-xl font-semibold mb-4" style="color: hsl(var(--foreground)); transition: color 0.3s ease;">Space Data</h2>
                            <For each={subSpace()}>
                                {(item) => (
                                    <div class="space-data-item">
                                        <div class="expression-display">
                                            <span class="expression-label">Expression: </span>
                                            <span class="expression-value">{item.expr}</span>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>
                </Suspense>
            </div>
        </div>
    );
};

export default LoadPage;