import { JSX } from "solid-js/jsx-runtime"
import { createMemo } from "solid-js"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Callout, CalloutContent } from "~/components/ui/callout"

interface OutputViewerProps {
    title?: string
    data: any
    format?: "json" | "text" | "metta"
    status?: "success" | "error" | "loading"
}

export function OutputViewer(props: OutputViewerProps): JSX.Element {
    const formatData = createMemo(() => {
        if (props.data === null || props.data === undefined) return "No output"
        if (typeof props.data === 'string' && props.data.trim() === '') return "Empty response"

        switch (props.format) {
            case "json":
                return JSON.stringify(props.data, null, 2)
            case "text":
            case "metta":
            default:
                if (typeof props.data === 'object') {
                    return JSON.stringify(props.data, null, 2);
                }
                return String(props.data)
        }
    })

    const statusStyles = createMemo(() => {
        switch (props.status) {
            case "success":
                // Use the darker foreground color for the background to ensure visibility
                return "bg-primary text-primary-foreground"
            case "error":
                return "bg-destructive text-destructive-foreground border-transparent"
            case "loading":
                return "bg-warning text-warning-foreground border-transparent"
            default:
                return "bg-muted text-muted-foreground"
        }
    })

    return (
        <Card>
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle class="text-sm font-medium">{props.title ?? "Output"}</CardTitle>
                <Badge class={statusStyles()}>
                    {props.status ?? "unknown"}
                </Badge>
            </CardHeader>
            <CardContent>
                <Callout class="min-h-[120px] max-h-[400px] w-full rounded-md border border-border bg-muted p-4 overflow-auto">
                    <CalloutContent>
                        {/* Use the main foreground color for better contrast */}
                        <pre class="text-sm font-mono whitespace-pre-wrap text-foreground">{formatData()}</pre>
                    </CalloutContent>
                </Callout>
            </CardContent>
        </Card>
    )
}