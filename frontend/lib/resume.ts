export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_FILENAME_HEADER = "X-Resume-Filename";
export type ResumeDraft = { full_name: string; major: string; school: string };
export type ParsedResume = {
  text: string;
  details: ResumeDraft & { email: string; phone: string; links: string[]; sections: Record<string, string> };
  metadata: { pages: number | null; ocr_pages: number };
  /** "queued" means the text was saved and the skill worker will pick it up. */
  scan: "queued" | "failed";
  /** The persisted version, used to poll this upload rather than a later upload. */
  resume_id?: string;
  warnings: string[];
};
