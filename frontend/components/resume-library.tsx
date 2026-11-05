"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchResumeLibrary, uploadLibraryResume, renameLibraryResume, removeLibraryResume, resumeFileUrl, setDefaultResume, setJobResume } from "@/lib/data";
import type { StoredResume, JobResumeChoice } from "@/lib/resume-library";

export function useResumeLibrary(userId: string, refreshKey: unknown) {
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [choices, setChoices] = useState<JobResumeChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchResumeLibrary(userId);
      if (current === request.current) { setResumes(next.resumes); setChoices(next.choices); }
    } catch (err) { if (current === request.current) setError((err as Error).message); }
    finally { if (current === request.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    const requests = request;
    void reload();
    return () => { requests.current++; };
  }, [reload, refreshKey]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await action(); await reload(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return { resumes, choices, loading, busy, error, reload, run,
    choose: (jobId: number, resumeId: string | null) => run(() => setJobResume(userId, jobId, resumeId)),
  };
}

export type ResumeLibraryModel = ReturnType<typeof useResumeLibrary>;

export function ResumeLibrary({ userId, library }: { userId: string; library: ResumeLibraryModel }) {
  const input = useRef<HTMLInputElement>(null);
  const { resumes, loading, busy, error, run, reload } = library;
  return <Card>
    <CardHeader>
      <CardTitle>Resume library</CardTitle>
      <CardDescription>Keep versions for different roles, then choose one for each tracked job. Your files are private.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || loading} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" />{busy ? "Saving…" : "Upload resume"}
        </Button>
        <span className="text-xs text-muted-foreground">PDF, DOCX, PNG or JPEG · up to 5 MB each</span>
        <input ref={input} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className="sr-only" aria-label="Upload resume version"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void run(() => uploadLibraryResume(userId, file));
          }} />
      </div>
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading resumes…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-600">
        <p>Could not update resume library: {error}</p><Button variant="outline" disabled={busy} onClick={() => void reload()}>Retry</Button>
      </div>}
      {!loading && !error && !resumes.length && <p className="text-sm text-muted-foreground">Upload your first resume. Give each version a name such as “Frontend internships” or “Data roles”.</p>}
      <ul className="grid gap-3">
        {resumes.map((resume) => <ResumeRow key={resume.id} resume={resume} disabled={busy || loading} run={run}
          uses={library.choices.filter((choice) => choice.resume_id === resume.id).length} />)}
      </ul>
    </CardContent>
  </Card>;
}

function ResumeRow({ resume, disabled, run, uses }: {
  resume: StoredResume; disabled: boolean; run: ResumeLibraryModel["run"]; uses: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(resume.name);
  const [fileError, setFileError] = useState<string | null>(null);
  async function openFile(download: boolean) {
    setFileError(null);
    // Open immediately so browsers allow the new tab, then navigate after signing.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await resumeFileUrl(resume, download);
      if (tab) tab.location.href = url;
      else setFileError("Allow pop-ups to open this file, then try again.");
    } catch (err) { tab?.close(); setFileError((err as Error).message); }
  }
  return <li className="grid gap-3 rounded-lg border p-4">
    <div className="flex items-start gap-3">
      <FileText aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{resume.name}{resume.is_default && <span className="ml-2 rounded bg-muted px-2 py-1 text-xs">Default</span>}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{resume.original_filename} · {Math.ceil(resume.file_size_bytes / 1024)} KB · Uploaded {new Date(resume.created_at).toLocaleDateString()} · {uses} tracked {uses === 1 ? "job" : "jobs"}</p>
      </div>
    </div>
    {editing && <form className="flex flex-wrap gap-2" onSubmit={(event) => {
      event.preventDefault();
      void run(async () => { await renameLibraryResume(resume.id, name); setEditing(false); });
    }}>
      <Input aria-label={`New name for ${resume.name}`} className="min-w-0 flex-1" maxLength={150} required value={name} onChange={(event) => setName(event.target.value)} disabled={disabled} />
      <Button type="submit" size="sm" disabled={disabled || !name.trim()}>Save name</Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(false)}>Cancel</Button>
    </form>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void openFile(false)}>View</Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void openFile(true)}>Download</Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setName(resume.name); setEditing(true); }}>Rename</Button>
      {!resume.is_default && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void run(() => setDefaultResume(resume.id))}>Make default</Button>}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => {
        if (window.confirm(`Delete “${resume.name}”? This also clears its selection from ${uses} tracked job(s).`)) void run(() => removeLibraryResume(resume));
      }}>Delete</Button>
    </div>
    {fileError && <p role="alert" className="text-sm text-red-600">{fileError}</p>}
  </li>;
}

export function JobResumeSelect({ jobId, jobTitle, library, onProfile }: {
  jobId: number; jobTitle: string; library: ResumeLibraryModel; onProfile: () => void;
}) {
  const value = library.choices.find((choice) => choice.job_id === jobId)?.resume_id ?? "";
  const defaultResume = library.resumes.find((resume) => resume.is_default);
  return <div className="grid min-w-48 gap-2">
    <label className="grid gap-1 text-xs font-medium">Resume for this job
      <select aria-label={`Resume for ${jobTitle}`} className="h-10 max-w-full rounded-md border bg-card px-2 text-sm"
        value={value} disabled={library.loading || library.busy || !!library.error}
        onChange={(event) => void library.choose(jobId, event.target.value || null)}>
        <option value="">No resume selected</option>
        {library.resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}{resume.is_default ? " (default)" : ""}</option>)}
      </select>
    </label>
    {library.loading && <p role="status" className="text-xs text-muted-foreground">Loading resumes…</p>}
    {library.error && <p role="alert" className="text-xs text-red-600">Could not load or save resume choice. <button className="underline" onClick={() => void library.reload()}>Retry</button></p>}
    <div className="flex flex-wrap gap-3 text-xs">
      {!value && defaultResume && <button type="button" className="text-primary underline" disabled={library.busy || library.loading || !!library.error} onClick={() => void library.choose(jobId, defaultResume.id)}>Use default</button>}
      <button type="button" className="text-primary underline" onClick={onProfile}>{library.resumes.length ? "Manage resumes" : "Upload a resume in Profile"}</button>
    </div>
  </div>;
}
