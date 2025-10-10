import { Component, Show } from "solid-js";
import { Button } from "~/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/Tabs";
import { CommandCard } from "~/components/common/CommandCard";
import { ToastViewport } from "~/components/ui/Toast";
import Loader from "lucide-solid/icons/loader";
import Upload_ from "lucide-solid/icons/upload";
import Link from "lucide-solid/icons/link";
import FileText from "lucide-solid/icons/file-text";
import File from "lucide-solid/icons/file";
import { formatedNamespace } from "~/lib/state";
import {
  uri,
  setUri,
  urlFormat,
  setUrlFormat,
  selectedFile,
  textContent,
  setTextContent,
  textFormat,
  setTextFormat,
  activeTab,
  setActiveTab,
  isLoading,
  isFileUploadImplemented,
  handleFileSelect,
  handleImport,
  formatFileSize,
  isFormValid,
} from "./lib";
import { UrlImportForm } from "./components/UrlImportForm";
import { FileUploadForm } from "./components/FileUploadForm";
import { TextInputForm } from "./components/TextInputForm";

export const UploadPage: Component = () => {
  const handleImportClick = () => {
    handleImport(formatedNamespace());
  };

  return (
    <>
      <ToastViewport />
      <div class="ml-10 mt-8">
        <CommandCard
          title="Import & Upload Data"
          description="Import data from a URL, upload a file, or input S-expression text directly."
        >
          <Tabs value={activeTab()} onChange={setActiveTab} class="w-full">
            <TabsList class="grid w-full grid-cols-3">
              <TabsTrigger value="url" class="flex items-center gap-2">
                <Link class="h-4 w-4" /> URL Import
              </TabsTrigger>
              <TabsTrigger value="file" class="flex items-center gap-2">
                <File class="h-4 w-4" /> File Upload
              </TabsTrigger>
              <TabsTrigger value="text" class="flex items-center gap-2">
                <FileText class="h-4 w-4" /> Text Input
              </TabsTrigger>
            </TabsList>

            <TabsContent value="url">
              <UrlImportForm
                uri={uri()}
                onUriChange={setUri}
                format={urlFormat()}
                onFormatChange={setUrlFormat}
                isLoading={isLoading()}
              />
            </TabsContent>

            <TabsContent value="file">
              <FileUploadForm
                selectedFile={selectedFile()}
                onFileSelect={handleFileSelect}
                isLoading={isLoading()}
                isFileUploadImplemented={isFileUploadImplemented}
                formatFileSize={formatFileSize}
              />
            </TabsContent>

            <TabsContent value="text">
              <TextInputForm
                content={textContent()}
                onContentChange={setTextContent}
                format={textFormat()}
                onFormatChange={setTextFormat}
                isLoading={isLoading()}
              />
            </TabsContent>
          </Tabs>

          <Show when={activeTab() !== "file" || isFileUploadImplemented}>
            <Button
              onClick={handleImportClick}
              disabled={isLoading() || !isFormValid()}
              class="mt-4 px-6"
            >
              <Show
                when={isLoading()}
                fallback={
                  <>
                    <Upload_ class="mr-2 h-4 w-4" />
                    {activeTab() === "url"
                      ? "Import from URL"
                      : activeTab() === "file"
                        ? "Upload File"
                        : "Upload Text"}
                  </>
                }
              >
                <Loader class="mr-2 h-4 w-4 animate-spin" /> Processing...
              </Show>
            </Button>
          </Show>
        </CommandCard>
      </div>
    </>
  );
};

export default UploadPage;
