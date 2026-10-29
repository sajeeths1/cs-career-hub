"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addResumeSkills, parseResume } from "@/lib/data";
import { MAX_RESUME_BYTES, type ParsedResume, type ResumeDraft } from "@/lib/resume";
import { cn } from "@/lib/utils";

type ResumeUploadProps = {
  userId: string;
  compact?: boolean;
  result: ParsedResume | null;
  onResult: (result: ParsedResume | null) => void;
  onProfileDraft: (draft: ResumeDraft) => void;
  /** Called after skills from the resume are saved, so a skills list on the same page can reload. */
  onSkillsSaved?: () => void;
};

export function ResumeUpload({ userId, compact = false, result, onResult, onProfileDraft, onSkillsSaved }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [draft, setDraft] = useState<ResumeDraft>({ full_name: "", major: "", school: "" });

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    setSelected([]);
    setNotice(null);
    setDraft({ full_name: result?.details.full_name ?? "", major: result?.details.major ?? "", school: result?.details.school ?? "" });
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

  async function saveSkills() {
    setSaving(true); setError(null); setNotice(null);
    try {
      await addResumeSkills(userId, selected);
      setSelected([]);
      setNotice("Selected skills added to My skills.");
      onSkillsSaved?.();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume center</CardTitle>
        <CardDescription>
          Extract details from your resume, including scanned pages. Review suggestions before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          className={cn("flex w-full flex-col items-center justify-center rounded-lg border border-dashed bg-muted/45 px-4 py-8 text-center transition-colors hover:bg-muted disabled:opacity-50", compact && "py-6")}
          type="button" disabled={busy || saving} onClick={() => inputRef.current?.click()}
        >
          <Upload className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold">{busy ? "Reading resume…" : result ? "Choose another resume" : "Upload and parse resume"}</span>
          <span className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PNG or JPEG · Up to 5 MB / 5 PDF pages</span>
        </button>
        <input ref={inputRef} aria-label="Choose resume" className="hidden" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => {
          void upload(event.target.files?.[0]); event.target.value = "";
        }} />
        <p className="text-xs text-muted-foreground">Processed on our server. The file and full extracted text are not stored. Contact details and work history stay in this review; only profile fields and skills you approve can be saved.</p>
        {busy && <p role="status" className="text-sm text-muted-foreground">Reading text and running OCR where needed. This may take up to 90 seconds.</p>}
        {(busy || result) && <Button type="button" variant="ghost" disabled={saving} onClick={() => {
          request.current?.abort(); setBusy(false); onResult(null); setError(null); setNotice(null);
        }}><X className="h-4 w-4" aria-hidden="true" />{busy ? "Cancel parsing" : "Discard extracted details"}</Button>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {result && <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{result.metadata.ocr_pages ? `OCR used on ${result.metadata.ocr_pages} page(s).` : "Read embedded document text."} Suggestions may contain mistakes; review them carefully.</p>
          {result.warnings.map(warning => <p role="status" className="text-sm text-amber-700" key={warning}>{warning}</p>)}
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">Review profile details</legend>
            {([['full_name', 'Name'], ['major', 'Major'], ['school', 'School']] as const).map(([field, label]) => <label key={field} className="grid gap-1 text-sm">{label}
              <Input value={draft[field]} maxLength={field === "school" ? 200 : 100} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))} />
            </label>)}
            <Button type="button" disabled={!Object.values(draft).some(value => value.trim())} onClick={() => onProfileDraft({ full_name: draft.full_name.trim(), major: draft.major.trim(), school: draft.school.trim() })}>Fill profile form</Button>
            <p className="text-xs text-muted-foreground">Fills nonempty details for editing. Use Save profile to confirm. Choose your preferred location, target roles and graduation year yourself.</p>
          </fieldset>
          <fieldset disabled={saving} className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Skills mentioned in your resume</legend>
            <p className="text-xs text-muted-foreground">Select skills you actually have. A mention alone does not confirm proficiency.</p>
            {result.skills.length ? result.skills.map(skill => <label className="flex items-center gap-2 text-sm" key={skill.id}>
              <input type="checkbox" checked={selected.includes(skill.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, skill.id] : previous.filter(id => id !== skill.id))} />{skill.name}
            </label>) : <p className="text-sm text-muted-foreground">No matches in the current skill catalog. You can manage your skills in the Skills tab.</p>}
            <Button type="button" disabled={saving || !selected.length} onClick={() => void saveSkills()}>{saving ? "Adding skills…" : "Add selected skills"}</Button>
          </fieldset>
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
