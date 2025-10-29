import type { Component } from "solid-js";
import { TextField, TextFieldLabel } from "~/components/ui/TextField";
import {
  Select,
  SelectTrigger,
  SelectItem,
  SelectContent,
  SelectValue,
} from "~/components/ui/Select";
import { CodeInputField } from "~/pages/upload/components/CodeInputField";

interface TextInputFormProps {
  content: string;
  onContentChange: (value: string) => void;
  format: string;
  onFormatChange: (value: string) => void;
  isLoading: boolean;
}

export const TextInputForm: Component<TextInputFormProps> = (props) => {
  return (
    <div class="space-y-4">
      <div class="space-y-2">
        <TextField>
          <TextFieldLabel for="text-format">Format</TextFieldLabel>
          <Select
            value={props.format}
            onChange={(newValue) => {
              if (newValue !== null) {
                props.onFormatChange(newValue);
              }
            }}
            disabled={props.isLoading}
            options={["metta", "json", "raw"]}
            itemComponent={(p) => (
              <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>
            )}
            placeholder="Select format"
          >
            <SelectTrigger id="text-format">
              <SelectValue>{props.format}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </TextField>
      </div>
      <TextField>
        <CodeInputField
          label="S-Expression Content"
          value={props.content}
          onChange={props.onContentChange}
          placeholder="Enter your S-expression code here..."
          syntax={props.format}
          rows={8}
        />
      </TextField>
      <div class="text-xs text-muted-foreground">
        <p>
          <strong>Example MeTTa expressions:</strong>
        </p>
        <ul class="list-disc list-inside mt-1 space-y-1">
          <li>(Id 1)</li>
          <li>(Name "Tony stark")</li>
          <li>(Alterego "Iron Man")</li>
        </ul>
      </div>
    </div>
  );
};
