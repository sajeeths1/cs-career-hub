"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchResumeScanStatus, parseResume } from "@/lib/data";
import { MAX_RESUME_BYTES, type ParsedResume, type ResumeDraft } from "@/lib/resume";
import { cn } from "@/lib/utils";

const SCAN_POLL_MS = 3000;
const SCAN_POLL_ATTEMPTS = 40; // Stop waiting after two minutes; the scan can still finish later.

type ResumeUploadProps = {
  compact?: boolean;
  result: ParsedResume | null;
  onResult: (result: ParsedResume | null) => void;
  onProfileDraft: (draft: ResumeDraft) => void;
  onSkillsSaved?: () => void;
};

export function ResumeUpload({ compact = false, result, onResult, onProfileDraft, onSkillsSaved }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const skillsSaved = useRef(onSkillsSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<"scanning" | "done" | "slow" | null>(null);
  const [draft, setDraft] = useState<ResumeDraft>({ full_name: "", major: "", school: "" });

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { skillsSaved.current = onSkillsSaved; }, [onSkillsSaved]);
  useEffect(() => {
    setDraft({ full_name: result?.details.full_name ?? "", major: result?.details.major ?? "", school: result?.details.school ?? "" });
  }, [result]);

  // The local worker scans the saved text, so wait for it and then refresh My skills.
  useEffect(() => {
    setScan(result?.scan === "queued" ? "scanning" : null);
    if (result?.scan !== "queued") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async (attempt: number) => {
      const status = await fetchResumeScanStatus().catch(() => "scanning");
      if (!active) return;
      if (status === "done") { setScan("done"); skillsSaved.current?.(); return; }
      if (attempt >= SCAN_POLL_ATTEMPTS) { setScan("slow"); return; }
      timer = setTimeout(() => void check(attempt + 1), SCAN_POLL_MS);
    };
    timer = setTimeout(() => void check(1), SCAN_POLL_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [result]);

  async function upload(file?: File) {
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    onResult(null);
    setError(null);
    setBusy(false);
    if (file.size === 0 || file.size > MAX_RESUME_BYTES) {
      setError("Choose a nonempty resume of at most 5 MB."); return;
    }
    if (!/\.(pdf|docx|png|jpe?g)$/i.test(file.name)) {
      setError("Use PDF, DOCX, PNG or JPEG. Convert older DOC files to PDF first."); return;
    }
    setBusy(true);
    try {
      const parsed = await parseResume(file, controller.signal);
      if (!controller.signal.aborted) onResult(parsed);
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add skills from your resume</CardTitle>
        <CardDescription>
          We scan your resume and add the skills it names to My skills automatically. You can remove any that don&apos;t fit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          className={cn("flex w-full items-center justify-between gap-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-4 py-5 text-left transition-colors hover:bg-blue-50 disabled:opacity-50", compact && "py-4")}
          type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1"><span className="block text-sm font-semibold">{busy ? "Reading resume…" : result ? "Choose another resume" : "Choose a resume"}</span>
            <span className="mt-1 block text-xs text-muted-foreground">PDF, DOCX, PNG or JPEG · Up to 5 MB / 5 PDF pages</span></span>
          <span className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium">Browse</span>
        </button>
        <input ref={inputRef} aria-label="Choose resume" className="hidden" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => {
          void upload(event.target.files?.[0]); event.target.value = "";
        }} />
        <p className="text-xs text-muted-foreground">Your PDF or DOCX file and its extracted text, including any contact details and work history, are stored privately so a model we run ourselves can scan them. For images, only the text is stored. They are kept until you upload another resume or delete your account. Profile fields are only saved if you approve them.</p>
        {busy && <p role="status" className="text-sm text-muted-foreground">Reading text and running OCR where needed. This may take up to 90 seconds.</p>}
        {(busy || result) && <Button type="button" variant="ghost" onClick={() => {
          request.current?.abort(); setBusy(false); onResult(null); setError(null);
        }}><X className="h-4 w-4" aria-hidden="true" />{busy ? "Cancel parsing" : "Hide extracted details"}</Button>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {scan === "scanning" && <p role="status" className="text-sm text-muted-foreground">Scanning your resume for skills. You can keep using the site while this runs.</p>}
        {scan === "done" && <p role="status" className="text-sm text-muted-foreground">Scan finished. Any skills we found are now in My skills. They may contain mistakes, so please check them.</p>}
        {scan === "slow" && <p role="status" className="text-sm text-muted-foreground">The skill scan is taking longer than usual. Your skills will appear in My skills when it finishes.</p>}
        {result && <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{result.metadata.ocr_pages ? `OCR used on ${result.metadata.ocr_pages} page(s).` : "Read embedded document text."} Details below may contain mistakes; review them carefully.</p>
          {result.warnings.map(warning => <p role="status" className="text-sm text-amber-700" key={warning}>{warning}</p>)}
          <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Use resume details in your profile</summary>
            <div className="mt-3 grid max-w-xl gap-3">{([['full_name', 'Name'], ['major', 'Major'], ['school', 'School']] as const).map(([field, label]) => <label key={field} className="grid gap-1 text-sm">{label}
              <Input value={draft[field]} maxLength={field === "school" ? 200 : 100} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))} />
            </label>)}
              <Button type="button" className="w-fit" disabled={!Object.values(draft).some(value => value.trim())} onClick={() => onProfileDraft({ full_name: draft.full_name.trim(), major: draft.major.trim(), school: draft.school.trim() })}>Fill profile form</Button>
              <p className="text-xs text-muted-foreground">Review and save the profile form in Profile. Set your target roles and preferred location there.</p>
            </div>
          </details>
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Contact details and resume sections</summary>
            <dl className="mt-3 space-y-2 break-words">
              <dt className="font-medium">Email</dt><dd>{result.details.email || "Not detected"}</dd>
              <dt className="font-medium">Phone</dt><dd>{result.details.phone || "Not detected"}</dd>
              <dt className="font-medium">Links</dt><dd>{result.details.links.join(" · ") || "Not detected"}</dd>
            </dl>
            {Object.entries(result.details.sections).map(([heading, content]) => <div className="mt-4" key={heading}><h4 className="font-medium capitalize">{heading}</h4><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{content}</p></div>)}
          </details>
          <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Full extracted text</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-xs">{result.text}</pre></details>
        </div>}
      </CardContent>
    </Card>
  );
}
