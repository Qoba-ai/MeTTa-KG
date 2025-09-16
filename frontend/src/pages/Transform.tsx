import { Component, createSignal, onCleanup, Show } from 'solid-js';
import MettaEditor from '../components/space/MettaEditor';
import { OutputViewer } from "~/components/upload/outputViewer";
import { CommandCard } from "~/components/upload/commandCard";
import { transform, isPathClear, Transformation } from '~/lib/api';
import { formatedNamespace } from "~/lib/state";
import toast from 'solid-toast';
import { showToast } from '~/components/ui/toast';

interface ParseResult {  
  patterns: string[];  
  templates: string[];  
}  

const TransformPage: Component = () => {
  const [sExpr, setSExpr] = createSignal(`(transform 
  (, $x)
  (, $x)
)`);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isPolling, setIsPolling] = createSignal(false);
  const [result, setResult] = createSignal<any>(null);
  
  let pollingIntervalId: NodeJS.Timeout | null = null;

  const stopPolling = () => {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    setIsPolling(false);
  };
  
  onCleanup(stopPolling);

  const startPolling = (spacePath: string) => {
    setIsPolling(true);
    pollingIntervalId = setInterval(async () => {
      try {
        const isClear = await isPathClear(spacePath);
        if (isClear) {
          stopPolling();
          setResult("Successfully transformed the space 🎉");
          toast.success("Transform completed!");
          showToast({ title: "Transform Completed", description: "The space has been successfully transformed." });
        }
      } catch (error) {
        // setResult({ error: "Failed to fetch transformation status." });
        showToast({ title: "Polling Error", description: "Failed to fetch transformation status.", variant: "destructive" });;
        stopPolling();
      }
    }, 3000);
  };

function parseTransformExpression(sExpr: string): ParseResult {  
  const cleaned = sExpr.trim();  
    
  // Parse the S-expression into a structured format  
  const expr = parseSExpression(cleaned);  
    
  if (!isTransformExpression || !expr.children) {  
    throw new Error("Expected transform expression with format: (transform (, patterns...) (, templates...))");  
  } 
  // Extract the comma lists  
  const patternsExpr = expr.children[1];  
  const templatesExpr = expr.children[2];  
    
  const patterns = parseCommaList(patternsExpr);  
  const templates = parseCommaList(templatesExpr);  
    
  return { patterns, templates };  
}  
  
interface SExpr {  
  type: 'atom' | 'list';  
  value?: string;  
  children?: SExpr[];  
}  
  
function parseSExpression(input: string): SExpr {  
  const tokens = tokenize(input);  
  const result = parseTokens(tokens);  
  if (!result) {  
    throw new Error("Failed to parse S-expression");  
  }  
  return result;  
}  
  
function tokenize(input: string): string[] {  
  const tokens: string[] = [];  
  let current = '';  
  let inString = false;  
  let depth = 0;  
    
  for (let i = 0; i < input.length; i++) {  
    const char = input[i];  
      
    if (char === '"' && (i === 0 || input[i-1] !== '\\')) {  
      inString = !inString;  
      current += char;  
    } else if (inString) {  
      current += char;  
    } else if (char === '(' || char === ')') {  
      if (current.trim()) {  
        tokens.push(current.trim());  
        current = '';  
      }  
      tokens.push(char);  
    } else if (/\s/.test(char)) {  
      if (current.trim()) {  
        tokens.push(current.trim());  
        current = '';  
      }  
    } else {  
      current += char;  
    }  
  }  
    
  if (current.trim()) {  
    tokens.push(current.trim());  
  }  
    
  return tokens;  
}  
  
function parseTokens(tokens: string[]): SExpr | null {  
  let index = 0;  
    
  function parseNext(): SExpr | null {  
    if (index >= tokens.length) return null;  
      
    const token = tokens[index++];  
      
    if (token === '(') {  
      const children: SExpr[] = [];  
        
      while (index < tokens.length && tokens[index] !== ')') {  
        const child = parseNext();  
        if (child) children.push(child);  
      }  
        
      if (index < tokens.length && tokens[index] === ')') {  
        index++; // consume ')'  
      }  
        
      return { type: 'list', children };  
    } else if (token !== ')') {  
      return { type: 'atom', value: token };  
    }  
      
    return null;  
  }  
    
  return parseNext();  
}  
  
function isTransformExpression(expr: SExpr): boolean {  
  return expr.type === 'list' &&  
         expr.children?.length === 3 &&  
         expr.children[0].type === 'atom' &&  
         expr.children[0].value === 'transform' &&  
         isCommaList(expr.children[1]) &&  
         isCommaList(expr.children[2]);  
}  
  
function isCommaList(expr: SExpr): boolean {  
  if (expr.type !== 'list' || !expr.children) {
    return false;
  }
  return expr.type === 'list' &&  
         expr.children?.length >= 1 &&  
         expr.children[0].type === 'atom' &&  
         expr.children[0].value === ',';  
}  
  
function parseCommaList(expr: SExpr): string[] {  
  if (!isCommaList(expr)) {  
    throw new Error("Expected comma list format: (, item1 item2 ...)");  
  }  
    
  // Skip the comma symbol and extract the rest  
  return expr.children!.slice(1).map(child => serializeSExpr(child));  
}  
  
function serializeSExpr(expr: SExpr): string {  
  if (expr.type === 'atom') {  
    return expr.value!;  
  } else {  
    const childrenStr = expr.children!.map(child => serializeSExpr(child)).join(' ');  
    return `(${childrenStr})`;  
  }  
}

  const handleTransform = async () => {  
    if (!sExpr().trim()) {  
      toast.error("Please enter a transform expression.");  
      return;  
    }  
      
    setIsLoading(true);  
    setResult(null);  
    stopPolling();  
    
    let spacePath = formatedNamespace();  
    
    try {  
      const pathIsClear = await isPathClear(spacePath);  
        
      if (!pathIsClear) {  
        showToast({ title: "Space Busy", description: "The space is currently busy. Please wait.", variant: "destructive" }); 
        setIsLoading(false);  
        return;  
      }  
    
      // Parse the S-expression to extract patterns and templates  
      const { patterns, templates } = parseTransformExpression(sExpr());  
      console.log("Parsed patterns:", patterns);  
      console.log("Parsed templates:", templates);

      const transformation: Transformation = {  
        space: spacePath,  
        patterns: patterns,  
        templates: templates  
      };  
    
      const success = await transform(transformation);
      
      if (success) {
        showToast({ title: "Transform Initiated", description: "Waiting for results..." });
        startPolling(spacePath);
      } else {
        showToast({ title: "Transform Failed", description: "Could not initiate the transformation.", variant: "destructive" });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      // setResult({ error: errorMessage });
      showToast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (file: File) => {
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
      title="Transform Data"
      description="Apply templates to matched patterns. Input S-Expression like: (transform (, (pattern)) (, (template)))"
      >
          <div class="space-y-4">
            <MettaEditor
              initialText={sExpr()}
              onTextChange={setSExpr}
              onFileUpload={handleFileUpload}
              parseErrors={[]}
              showActionButtons={false}
            />
          </div>

          <button
            onClick={handleTransform}
            disabled={isLoading() || isPolling() || !sExpr().trim()}
            class="inline-flex items-center justify-center w-[180px] h-10 mt-4 px-4 bg-primary text-primary-foreground font-medium text-sm rounded-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
          >
            <Show when={isLoading() || isPolling()}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="animate-spin mr-2 h-4 w-4"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </Show>
            <Show when={isLoading()} fallback={
              <Show when={isPolling()} fallback={"Run Transform"}>
                Waiting for results...
              </Show>
            }>
              Transforming...
            </Show>
          </button>

          <Show when={result()}>
            {(res) => (
              <OutputViewer
                title="Transform Results"
                data={res()}
                status={res().error ? 'error' : 'success'}
              />
            )}
          </Show>
      </CommandCard>
    </div>
  );
};

export default TransformPage;