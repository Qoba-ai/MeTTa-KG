import { For } from "solid-js";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";
import { Plus, Trash2 } from "lucide-solid";
import NameSpace from "~/pages/index/components/NameSpace";

type Token = {
  namespace: string;
  description: string;
};

interface Item {
  id: string;
  namespace: string[];
}

interface IntersectionInputProps {
  type: "sources" | "target";
  items: Item[];
  addItem?: () => void;
  removeItem?: (id: string) => void;
  updateItem: (id: string, ns: string[]) => void;
  accentColor: string;
  rootToken: boolean;
  tokenRootNamespace: () => string[];
  getAllTokens: () => Promise<Token[]>;
}

export function IntersectionInput(props: IntersectionInputProps) {
  const title = props.type === "sources" ? "Sources" : "Target";
  const description =
    props.type === "sources"
      ? "Select two or more source namespaces"
      : "Select target namespace";

  return (
    <Card class={`border-l-4 border-l-${props.accentColor}`}>
      <CardHeader>
        <div class="flex items-center">
          <div class={`w-2 h-2 bg-${props.accentColor} rounded-full mr-2`}></div>
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <div class="flex gap-2 bg-neutral-800 p-3">
                <div class="flex-1 flex flex-col gap-2">
                  <NameSpace
                    namespace={item.namespace}
                    setNamespace={(ns) => props.updateItem(item.id, ns)}
                    rootToken={props.rootToken}
                    tokenRootNamespace={props.tokenRootNamespace}
                    getAllTokens={props.getAllTokens}
                  />
                </div>
                {props.type === "sources" && props.removeItem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.removeItem!(item.id)}
                    disabled={props.items.length <= 2}
                    class="text-destructive hover:text-destructive self-center"
                  >
                    <Trash2 class="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </For>
          {props.type === "sources" && props.addItem && (
            <>
              <hr class="my-4" />
              <Button variant="outline" size="sm" onClick={props.addItem} class="w-full">
                <Plus class="w-4 h-4 mr-2" />
                Add Source
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
