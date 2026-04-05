import { useParams, Link } from "wouter";
import { useGetPliego, useExportPliego } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Download, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";

export default function Export() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  
  const { data: pliego, isLoading: isPliegoLoading } = useGetPliego(id, {
    query: { enabled: !!id, queryKey: ["pliego", id] }
  });
  
  const exportPliego = useExportPliego();
  
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "png" | null>(null);
  const [exportResult, setExportResult] = useState<{ downloadUrl: string; filename: string } | null>(null);

  const handleExport = (format: "pdf" | "png") => {
    setExportingFormat(format);
    setExportResult(null);
    exportPliego.mutate(
      {
        id,
        data: { format, dpi: pliego?.dpi || 300 }
      },
      {
        onSuccess: (result) => {
          setExportResult(result);
          setExportingFormat(null);
          // Auto trigger download
          window.open(result.downloadUrl, "_blank");
        },
        onError: () => {
          setExportingFormat(null);
        }
      }
    );
  };

  if (isPliegoLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pliego) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Pliego not found</h1>
        <Link href="/pliegos">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> Back to Pliegos</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href={`/?pliegoId=${id}`}>
          <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Editor
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Export {pliego.name}</CardTitle>
            <CardDescription>
              Choose a format to export your pliego for printing.
              Dimensions: {pliego.widthCm}x{pliego.heightCm}cm at {pliego.dpi} DPI.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-3 border-2 hover:border-primary/50"
              onClick={() => handleExport("pdf")}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === "pdf" ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <FileText className="h-8 w-8 text-primary" />
              )}
              <div className="text-center">
                <div className="font-semibold">Export as PDF</div>
                <div className="text-xs text-muted-foreground font-normal">Vector-friendly, best for professional rips</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-3 border-2 hover:border-primary/50"
              onClick={() => handleExport("png")}
              disabled={exportingFormat !== null}
            >
              {exportingFormat === "png" ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <ImageIcon className="h-8 w-8 text-primary" />
              )}
              <div className="text-center">
                <div className="font-semibold">Export as PNG</div>
                <div className="text-xs text-muted-foreground font-normal">Transparent background, rasterized</div>
              </div>
            </Button>
          </CardContent>
          
          {exportResult && (
            <CardFooter className="flex-col items-stretch border-t bg-muted/10 pt-6">
              <div className="flex items-center justify-between p-4 border rounded-md bg-background">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-primary/10 p-2 rounded text-primary">
                    <Download className="h-4 w-4" />
                  </div>
                  <div className="truncate text-sm font-medium">
                    {exportResult.filename}
                  </div>
                </div>
                <Button size="sm" asChild>
                  <a href={exportResult.downloadUrl} target="_blank" rel="noopener noreferrer">
                    Download
                  </a>
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
