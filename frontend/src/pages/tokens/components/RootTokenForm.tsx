import { createSignal } from 'solid-js'
import type { Component } from 'solid-js'
import { Button } from '~/components/ui/Button'
import {
    TextField,
    TextFieldInput,
    TextFieldLabel,
} from '~/components/ui/TextField'
import Eye from 'lucide-solid/icons/eye'
import EyeOff from 'lucide-solid/icons/eye-off'

interface RootTokenFormProps {
    initialToken: string | null
    onLoad: (token: string | null) => void
}

export const RootTokenForm: Component<RootTokenFormProps> = (props) => {
    const [showToken, setShowToken] = createSignal(false)
    let inputRef: HTMLInputElement | undefined

    const handleSubmit = (e: Event) => {
        e.preventDefault()
        if (inputRef) {
            const token = inputRef.value.trim()
            props.onLoad(token ? token : null)
        }
    }

    return (
        <form onSubmit={handleSubmit} class="flex items-end gap-4">
            <div class="flex-grow">
                <TextField>
                    <TextFieldLabel for="root-token-input">
                        Access Token
                    </TextFieldLabel>
                    <div class="relative">
                        <TextFieldInput
                            ref={inputRef}
                            id="root-token-input"
                            type={showToken() ? 'text' : 'password'}
                            placeholder="Enter your root token to manage other tokens"
                            value={props.initialToken ?? ''}
                        />
                        <button
                            type="button"
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                            tabindex="-1"
                            onClick={() => setShowToken((v) => !v)}
                        >
                            {showToken() ? (
                                <EyeOff size={18} />
                            ) : (
                                <Eye size={18} />
                            )}
                        </button>
                    </div>
                </TextField>
            </div>
            <Button type="submit">Load Tokens</Button>
        </form>
    )
}
