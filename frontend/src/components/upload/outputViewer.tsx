import { JSX } from "solid-js/jsx-runtime"
import { createMemo } from "solid-js"

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Callout, CalloutContent, CalloutTitle } from "~/components/ui/callout"

interface OutputViewerProps {
	title?: string
	data: any
	format?: "json" | "text" | "metta"
	status?: "success" | "error" | "loading"
}

export function OutputViewer(props: OutputViewerProps): JSX.Element {
	const formatData = createMemo(() => {
		if (!props.data) return "No output"

		switch (props.format) {
			case "json":
				return JSON.stringify(props.data, null, 2)
			case "text":
			case "metta":
			default:
				return String(props.data)
		}
	})

	const statusColor = createMemo(() => {
		switch (props.status) {
			case "success":
				return "bg-green-500"
			case "error":
				return "bg-red-500"
			case "loading":
				return "bg-yellow-500"
			default:
				return "bg-gray-500"
		}
	})

	return (
		<Card>
			<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle class="text-sm font-medium">{props.title ?? "Output"}</CardTitle>
				<Badge variant="outline" class={`${statusColor()} text-white`}>
					{props.status}
				</Badge>
			</CardHeader>
			<CardContent>
				<Callout class="h-[200px] w-full rounded-md border p-4">
					<CalloutTitle>Output</CalloutTitle>
					<CalloutContent class="mt-2">
						<pre class="text-sm font-mono whitespace-pre-wrap">{formatData()}</pre>
					</CalloutContent>
				</Callout>
			</CardContent>
		</Card>
	)
}
