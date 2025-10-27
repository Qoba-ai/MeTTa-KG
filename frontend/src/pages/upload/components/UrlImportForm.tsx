import type { Component } from 'solid-js'
import {
    TextField,
    TextFieldInput,
    TextFieldLabel,
} from '~/components/ui/TextField'
import {
    Select,
    SelectTrigger,
    SelectItem,
    SelectContent,
    SelectValue,
} from '~/components/ui/Select'

interface UrlImportFormProps {
    uri: string
    onUriChange: (value: string) => void
    format: string
    onFormatChange: (value: string) => void
    isLoading: boolean
}

export const UrlImportForm: Component<UrlImportFormProps> = (props) => {
    return (
        <div class="space-y-4">
            <div class="space-y-2">
                <TextField>
                    <TextFieldLabel for="import-uri">Import URL</TextFieldLabel>
                    <TextFieldInput
                        id="import-uri"
                        value={props.uri}
                        onInput={(e) =>
                            props.onUriChange(e.currentTarget.value)
                        }
                        placeholder="https://example.com/data.json"
                        disabled={props.isLoading}
                    />
                </TextField>
                <p class="text-xs text-muted-foreground">
                    Enter a URL to import data from.
                </p>
            </div>
            <div class="space-y-2">
                <TextField>
                    <TextFieldLabel for="url-format">Format</TextFieldLabel>
                </TextField>
                <Select
                    value={props.format}
                    onChange={(newValue) => {
                        if (newValue !== null) {
                            props.onFormatChange(newValue)
                        }
                    }}
                    options={['json', 'metta', 'csv', 'raw']}
                    disabled={props.isLoading}
                    placeholder="Select format"
                    itemComponent={(p) => (
                        <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>
                    )}
                >
                    <SelectTrigger id="url-format">
                        <SelectValue>{props.format}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                </Select>
            </div>
        </div>
    )
}
