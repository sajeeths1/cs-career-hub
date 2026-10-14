"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ResumeUploadProps = {
  compact?: boolean;
};

export function ResumeUpload({ compact = false }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState<File | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume center</CardTitle>
        <CardDescription>
          Frontend-only upload preview. No file is sent to a server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          className={cn(
            "flex w-full flex-col items-center justify-center rounded-lg border border-dashed bg-muted/45 px-4 py-8 text-center transition-colors hover:bg-muted",
            compact && "py-6",
          )}
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold">Upload resume</span>
          <span className="mt-1 text-xs text-muted-foreground">PDF, DOC, or DOCX</span>
        </button>

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(event) => setResume(event.target.files?.[0] ?? null)}
        />

        {resume ? (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{resume.name}</p>
              <p className="text-xs text-muted-foreground">
                {(resume.size / 1024 / 1024).toFixed(2)} MB selected locally
              </p>
            </div>
            <Button
              aria-label="Remove selected resume"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => {
                setResume(null);
                if (inputRef.current) {
                  inputRef.current.value = "";
                }
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
