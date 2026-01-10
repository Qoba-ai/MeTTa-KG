import { TextFieldTextArea, TextFieldLabel } from "~/components/ui/TextField";

interface CodeEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  syntax?: string;
  rows?: number;
}

export function CodeInputField({
  label,
  value,
  onChange,
  placeholder,
  syntax = "metta",
  rows = 4,
}: CodeEditorProps) {
  return (
    <div class="space-y-2">
      <TextFieldLabel for={label.toLowerCase().replace(/\s+/g, "-")}>
        {label}
      </TextFieldLabel>
      <TextFieldTextArea
        id={label.toLowerCase().replace(/\s+/g, "-")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        class="font-mono text-sm"
        aria-describedby={`${label.toLowerCase().replace(/\s+/g, "-")}-description`}
      />
      <p
        id={`${label.toLowerCase().replace(/\s+/g, "-")}-description`}
        class="text-xs text-muted-foreground"
      >
        {syntax === "metta" ? "MeTTa S-Expression syntax" : `${syntax} format`}
      </p>
    </div>
  );
}
