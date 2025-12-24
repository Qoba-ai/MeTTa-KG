import { Component, Show } from 'solid-js'
import {
    TextField,
    TextFieldInput,
    TextFieldLabel,
} from '~/components/ui/TextField'
import NotImplemented from '~/components/common/NotImplemented'
import File from 'lucide-solid/icons/file'

interface FileUploadFormProps {
    selectedFile: File | null
    onFileSelect: (event: Event) => void
    isLoading: boolean
    isFileUploadImplemented: boolean
    formatFileSize: (bytes: number) => string
}

export const FileUploadForm: Component<FileUploadFormProps> = (props) => {
    return (
        <Show
            when={props.isFileUploadImplemented}
            fallback={<NotImplemented name="File Upload" />}
        >
            <div class="space-y-4">
                <div class="space-y-2">
                    <TextField>
                        <TextFieldLabel for="file-upload">
                            Select File
                        </TextFieldLabel>
                        <TextFieldInput
                            id="file-upload"
                            type="file"
                            onChange={props.onFileSelect}
                            disabled={props.isLoading}
                            class="cursor-pointer"
                            accept=".json,.metta,.csv,.txt"
                        />
                    </TextField>
                    <p class="text-xs text-muted-foreground">
                        Supported formats: JSON, MeTTa, CSV, TXT
                    </p>
                </div>
                <Show when={props.selectedFile}>
                    <div class="flex items-center gap-2 p-3 bg-muted rounded-md">
                        <File class="h-4 w-4" />
                        <div class="flex-1">
                            <p class="text-sm font-medium">
                                {props.selectedFile!.name}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {props.formatFileSize(props.selectedFile!.size)}{' '}
                                • {props.selectedFile!.type || 'Unknown type'}
                            </p>
                        </div>
                    </div>
                </Show>
            </div>
        </Show>
    )
}
