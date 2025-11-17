import { For } from "solid-js";
import { Button } from "~/components/ui/Button";
import { TextField, TextFieldInput } from "~/components/ui/TextField";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";
import { Plus, Trash2 } from "lucide-solid";

interface Item {
  id: string;
  namespace: string;
  value: string;
}

interface TransformInputProps {
  type: "patterns" | "templates";
  items: Item[];
  addItem: () => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, field: "namespace" | "value", value: string) => void;
  accentColor: string;
}

export function TransformInput(props: TransformInputProps) {
  const title = props.type === "patterns" ? "Patterns" : "Templates";
  const description =
    props.type === "patterns"
      ? "Define patterns to match against"
      : "Define templates for transformations";

  return (
    <Card class={`border-l-4 border-l-${props.accentColor}`}>
      <CardHeader>
        <div class="flex items-center">
          <div
            class={`w-2 h-2 bg-${props.accentColor} rounded-full mr-2`}
          ></div>
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <div class="flex gap-2">
                <div class="flex-1 grid grid-cols-2 gap-2">
                  <TextField>
                    <TextFieldInput
                      value={item.namespace}
                      onInput={(e) =>
                        props.updateItem(
                          item.id,
                          "namespace",
                          e.currentTarget.value
                        )
                      }
                      placeholder="Namespace"
                      class="text-sm"
                    />
                  </TextField>
                  <TextField>
                    <TextFieldInput
                      value={item.value}
                      onInput={(e) =>
                        props.updateItem(
                          item.id,
                          "value",
                          e.currentTarget.value
                        )
                      }
                      placeholder="Pattern/Template value"
                      class="text-sm font-mono resize-none"
                    />
                  </TextField>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => props.removeItem(item.id)}
                  disabled={props.items.length === 1}
                  class="text-destructive hover:text-destructive self-center"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={props.addItem}
          class="w-full mt-4"
        >
          <Plus class="w-4 h-4 mr-2" />
          Add {props.type === "patterns" ? "Pattern" : "Template"}
        </Button>
      </CardContent>
    </Card>
  );
}
