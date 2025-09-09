import { Component, createSignal, createEffect, Show } from "solid-js"
import { Button } from "~/components/ui/button"
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field"
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from "~/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { CodeInputField } from "~/components/upload/codeInputField"
import { CommandCard } from "~/components/upload/commandCard"
import toast from 'solid-toast'
import Loader from 'lucide-solid/icons/loader'
import Upload_ from 'lucide-solid/icons/upload'
import Link from 'lucide-solid/icons/link'
import FileText from 'lucide-solid/icons/file-text'
import File from 'lucide-solid/icons/file'
import { importSpace, importData, uploadTextToSpace } from '~/lib/api'; // <-- add upload
import { formatedNamespace } from "~/lib/state"
import NotImplemented from "~/components/common/NotImplemented"


export const UploadPage: Component = () => {
	// URL Import state
	const [uri, setUri] = createSignal("")
	const [urlFormat, setUrlFormat] = createSignal("metta")

	// File Upload state
	const [selectedFile, setSelectedFile] = createSignal<File | null>(null)
	let fileInputRef: HTMLInputElement | undefined
	const isFileUploadImplemented = false; // Feature flag for file upload

	// Text Input state
	const [textContent, setTextContent] = createSignal(`(= (fact 0) 1)
(= (fact $n) (* $n (fact (- $n 1))))
(fact 5)`)
	const [textFormat, setTextFormat] = createSignal("metta")

	// Common state
	const [activeTab, setActiveTab] = createSignal("url")
	const [isLoading, setIsLoading] = createSignal(false)
	const [result, setResult] = createSignal<any>(null)

	const handleFileSelect = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0]
		if (file) {
			setSelectedFile(file)
		}
	}

	const handleImport = async () => {
		setIsLoading(true)
		setResult(null) // Clear previous results

		try {
			let response

			switch (activeTab()) {
				case "url":
					if (!uri().trim()) {
						toast(
							"Missing URL" +
							"Please enter a valid URL to import data from.",
						)
						return
					}
					response = await importSpace(formatedNamespace(), uri())
					if (response) {
						setResult("Successfully imported to space")
						toast(
							"Import Successful. " +
							`Data was imported from "${uri()}" into the "${formatedNamespace()}" space.`,
						)
					} else {
						toast(
							"Import Failed. " +
							"The server could not import data from the provided URL.",
						)
					}
					break

				case "file":
					if (!selectedFile()) {
						toast(
							"No File Selected. " +
							"Please select a file to upload.",
						)
						return
					}
					const formData = new FormData()
					formData.append("file", selectedFile()!)
					response = await importData("file", formData, "metta")
					if (response.status === "success") {
						setResult({ data: response.data, status: "success" })
						toast(
							"File Uploaded. " +
							`File "${selectedFile()!.name}" was uploaded successfully.`,
						)
					} else {
						setResult({ error: response.message, status: "error" })
						toast(
							"File Upload Failed. " +
							response.message || "The server could not process the uploaded file.",
						)
					}
					break

				case "text":
					if (!textContent().trim()) {
						toast(
							"Missing Text Content. " +
							"Please enter S-expression text to upload.",
						)
						return
					}
					try {
						const cleanText = textContent().replace(/[\r\n]+/g, '\n').trim();
						const response = await uploadTextToSpace(formatedNamespace(), cleanText);
						setResult({ data: response, status: "success" });
						toast(
							"Text Uploaded. " +
							`Your S-expression text was uploaded to the "${formatedNamespace()}" space.`,
						)
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
						setResult({ error: errorMessage, status: "error" });
						toast(
							"Text Upload Failed. " +
							errorMessage,
						)
					}
					break

				default:
					toast(
						"Invalid Tab. " +
						"Please select a valid import method.",
					)
					throw new Error("Invalid tab selection")
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
			console.error("Import error:", error)
			setResult({ error: errorMessage, status: "error" })
			toast(
				"Unexpected Error. " +
				errorMessage,
			)
		} finally {
			setIsLoading(false)
		}
	}

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i]);
	}

	const isFormValid = () => {
		switch (activeTab()) {
			case "url":
				return uri().trim() !== ""
			case "file":
				return selectedFile() !== null
			case "text":
				return textContent().trim() !== ""
			default:
				return false
		}
	}

	return (
		<>
			<div class="ml-10 mt-8">
				<CommandCard
					title="Import & Upload Data"
					description="Import data from a URL, upload a file, or input S-expression text directly."
				>
					<Tabs value={activeTab()} onChange={setActiveTab} class="w-full">
						<TabsList class="grid w-full grid-cols-3">
							<TabsTrigger value="url" class="flex items-center gap-2">
								<Link class="h-4 w-4" />
								URL Import
							</TabsTrigger>
							<TabsTrigger value="file" class="flex items-center gap-2">
								<File class="h-4 w-4" />
								File Upload
							</TabsTrigger>
							<TabsTrigger value="text" class="flex items-center gap-2">
								<FileText class="h-4 w-4" />
								Text Input
							</TabsTrigger>
						</TabsList>

						<TabsContent value="url" class="space-y-4">
							<div class="space-y-4">
								<div class="space-y-2">
									<TextField>
										<TextFieldLabel for="import-uri">Import URL</TextFieldLabel>
										<TextFieldInput
											id="import-uri"
											value={uri()}
											onChange={(e) => setUri(e.currentTarget.value)}
											placeholder="https://example.com/data.json or /path/to/local/file.json"
											disabled={isLoading()}
										/>
									</TextField>
									<p class="text-xs text-muted-foreground">
										Enter a URL or local file path to import data from
									</p>
								</div>

								<div class="space-y-2">
									<TextField>
										<TextFieldLabel for="url-format">Format</TextFieldLabel>
									</TextField>
									<Select
										value={urlFormat()}
										onChange={setUrlFormat}
										options={["json", "metta", "csv", "raw"]}
										disabled={isLoading()}
										placeholder="Select format"
										itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>}
									>
										<SelectTrigger id="url-format">
											<SelectValue>{urlFormat()}</SelectValue>
										</SelectTrigger>
										<SelectContent />
									</Select>
								</div>
							</div>
						</TabsContent>

						<TabsContent value="file" class="space-y-4">
							<Show when={isFileUploadImplemented} fallback={<NotImplemented name="File Upload" />}>
								<div class="space-y-4">
									<div class="space-y-2">
										<TextField>
											<TextFieldLabel for="file-upload">Select File</TextFieldLabel>
											<TextFieldInput
												id="file-upload"
												type="file"
												ref={fileInputRef}
												onChange={handleFileSelect}
												disabled={isLoading()}
												class="cursor-pointer"
												accept=".json,.metta,.csv,.txt"
											/>
										</TextField>
										<p class="text-xs text-muted-foreground">
											Supported formats: JSON, MeTTa, CSV, TXT
										</p>
									</div>

									<Show when={selectedFile()}>
										<div class="flex items-center gap-2 p-3 bg-muted rounded-md">
											<File class="h-4 w-4" />
											<div class="flex-1">
												<p class="text-sm font-medium">{selectedFile()!.name}</p>
												<p class="text-xs text-muted-foreground">
													{formatFileSize(selectedFile()!.size)} • {selectedFile()!.type || "Unknown type"}
												</p>
											</div>
										</div>
									</Show>
								</div>
							</Show>

						</TabsContent>

						<TabsContent value="text" class="space-y-4">
							<div class="space-y-4">
								<div class="space-y-2">
									<TextField>
										<TextFieldLabel for="text-format">Format</TextFieldLabel>
										<Select
											value={textFormat()}
											onChange={setTextFormat}
											disabled={isLoading()}
											options={["metta", "json", "raw"]}
											itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>}
											placeholder="Select format"
										>
											<SelectTrigger>
												<SelectValue>{textFormat()}</SelectValue>
											</SelectTrigger>
											<SelectContent />
										</Select>
									</TextField>
								</div>

								<TextField>
									<CodeInputField
										label="S-Expression Content"
										value={textContent()}
										onChange={setTextContent}
										placeholder="Enter your S-expression code here..."
										syntax={textFormat()}
										rows={8}
									/>
								</TextField>

								<div class="text-xs text-muted-foreground">
									<p>
										<strong>Example MeTTa expressions:</strong>
									</p>
									<ul class="list-disc list-inside mt-1 space-y-1">
										<li>(= (fact 0) 1)</li>
										<li>(= (fact $n) (* $n (fact (- $n 1))))</li>
										<li>(fact 5)</li>
									</ul>
								</div>
							</div>
						</TabsContent>
					</Tabs>

					<Show when={activeTab() !== "file" || isFileUploadImplemented}>
						<Button onClick={handleImport} disabled={isLoading() || !isFormValid()} class="w-40">
							<Show
								when={isLoading()}
								fallback={
									<>
										<Upload_ class="mr-2 h-4 w-4" />
										{activeTab() === "url" ? "Import from URL" : activeTab() === "file" ? "Upload File" : "Upload Text"}
									</>
								}
							>
								<Loader class="mr-2 h-4 w-4 animate-spin" />
								Processing...
							</Show>
						</Button>

					</Show>

					{
						//<Show when={result()}>
						//	<OutputViewer title="Import Result" data={result()} status="success" />
						//</Show>
					}
				</CommandCard>
			</div>
		</>
	)
}

export default UploadPage;
