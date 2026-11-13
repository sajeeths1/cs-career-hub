"""Local, text-first resume extraction. stdin bytes -> stdout JSON; no file storage."""
import io
import json
import re
import sys
import tempfile
import warnings
import zipfile
from pathlib import Path

import pymupdf as fitz
import pytesseract
from defusedxml.ElementTree import fromstring
from PIL import Image, ImageOps

MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 5
MAX_TEXT = 60_000
Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
# Leptonica on macOS can fail to open files through the /tmp symlink.
tempfile.tempdir = str(Path(tempfile.gettempdir()).resolve())


class ResumeError(ValueError):
    pass


def ocr_image(image):
    image = ImageOps.autocontrast(ImageOps.exif_transpose(image).convert("L"))
    image.thumbnail((2800, 2800))
    try:
        return pytesseract.image_to_string(image, lang="eng", timeout=15)
    except pytesseract.TesseractNotFoundError as error:
        raise ResumeError("OCR is unavailable. Install Tesseract on the server.") from error
    except pytesseract.TesseractError as error:
        raise ResumeError("OCR could not read this image. Check the server's English Tesseract data or upload a clearer PDF.") from error
    except RuntimeError as error:
        raise ResumeError("OCR timed out. Try a clearer, smaller scan.") from error


def extract_text(data):
    if not data or len(data) > MAX_BYTES:
        raise ResumeError("Upload a nonempty resume of at most 5 MB.")
    ocr_pages = 0
    if data.startswith(b"%PDF-"):
        with fitz.open(stream=data, filetype="pdf") as document:
            if document.needs_pass:
                raise ResumeError("Remove the PDF password before uploading.")
            if not 1 <= len(document) <= MAX_PAGES:
                raise ResumeError("Resumes may contain up to 5 pages.")
            pages = []
            for page in document:
                text = page.get_text(sort=True)
                # Decide per page, so a scanned second page is not silently skipped.
                if sum(char.isalnum() for char in text) < 40:
                    rect = page.rect
                    if rect.width <= 0 or rect.height <= 0:
                        raise ResumeError("The PDF contains an invalid page.")
                    scale = min(3, 2800 / max(rect.width, rect.height))
                    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY)
                    text = ocr_image(Image.frombytes("L", (pix.width, pix.height), pix.samples))
                    ocr_pages += 1
                pages.append(text)
            text = "\n\n".join(pages)
            page_count = len(document)
    elif data.startswith(b"PK\x03\x04"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if len(archive.infolist()) > 1000 or sum(item.file_size for item in archive.infolist()) > 20_000_000:
                raise ResumeError("The DOCX is too large after decompression.")
            if "word/document.xml" not in archive.namelist():
                raise ResumeError("Upload a valid DOCX document.")
            ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            # Contact information is often placed in a Word header.
            headers = sorted(name for name in archive.namelist() if re.fullmatch(r"word/header\d+\.xml", name))
            parts = []
            for name in [*headers, "word/document.xml"]:
                root = fromstring(archive.read(name), forbid_dtd=True)
                parts.extend("".join(p.itertext()) for p in root.iter(ns + "p"))
            text = "\n".join(parts)
            page_count = None  # DOCX pagination depends on its renderer.
    elif data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8\xff"):
        with Image.open(io.BytesIO(data)) as image:
            text = ocr_image(image)
        page_count, ocr_pages = 1, 1
    else:
        raise ResumeError("Use a PDF, DOCX, PNG or JPEG. Convert legacy DOC files to PDF first.")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text).strip()
    if len(text) > MAX_TEXT:
        raise ResumeError("The resume contains too much text. Upload a shorter version.")
    if sum(char.isalnum() for char in text) < 25:
        raise ResumeError("No readable resume text found. Try a clearer scan or a text-based PDF.")
    return text, {"pages": page_count, "ocr_pages": ocr_pages}


HEADINGS = {
    "education": "education", "academic background": "education",
    "experience": "experience", "work experience": "experience", "professional experience": "experience",
    "employment": "experience", "internships": "experience",
    "projects": "projects", "personal projects": "projects", "academic projects": "projects",
    "skills": "skills", "technical skills": "skills", "technologies": "skills",
    "summary": "summary", "professional summary": "summary", "objective": "summary",
    "certifications": "certifications", "awards": "awards", "activities": "activities",
}


def parse_details(text):
    """Conservative suggestions, not invented work history or career preferences."""
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    sections = {}
    current = None
    for line in lines:
        heading = HEADINGS.get(line.lower().strip(" :|•-"))
        if heading:
            current = heading
        elif current:
            sections.setdefault(current, []).append(line)
    sections = {key: "\n".join(value) for key, value in sections.items()}
    name = ""
    for line in lines[:4]:
        candidate = re.split(r"\s*[|•]\s*", line)[0]
        words = candidate.split()
        if 2 <= len(words) <= 5 and len(candidate) <= 100 and all(re.fullmatch(r"[^\W\d_]+(?:[.'’-][^\W\d_]+)*\.?", word) for word in words):
            if not any(word.lower() in {"resume", "curriculum", "vitae", "engineer", "developer", "university", "college", "skills", "experience", "education"} for word in words):
                name = candidate.title() if candidate.isupper() else candidate
                break
    email = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", text)
    phone = re.search(r"(?<!\w)(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\d)", text)
    education = sections.get("education", "")
    major = re.search(r"(?:\b(?:major|field of study)\s*:\s*|\b(?:bachelor|master)(?:[’']s)?(?: of (?:science|arts|engineering))?\s+in\s+|\b(?:B\.?S\.?|M\.?S\.?)\s+(?:in\s+)?)([A-Za-z][A-Za-z &/-]{2,70})", education, re.I)
    school = next((line for line in education.splitlines() if re.search(r"\b(university|college|institute of technology)\b", line, re.I)), "")
    return {
        "full_name": name, "major": major.group(1).strip(" ,;|") if major else "",
        "school": school[:200], "email": email.group(0) if email else "",
        "phone": phone.group(0) if phone else "",
        "links": list(dict.fromkeys(re.findall(r"(?:https?://)?(?:www\.)?(?:linkedin\.com/in/|github\.com/)[A-Za-z0-9_./%-]+", text, re.I))),
        "sections": sections,
    }


def process(data):
    text, metadata = extract_text(data)
    return {"text": text, "details": parse_details(text), "metadata": metadata}


if __name__ == "__main__":
    try:
        print(json.dumps(process(sys.stdin.buffer.read(MAX_BYTES + 1))))
    except ResumeError as error:
        print(json.dumps({"error": str(error)}))
    except Exception:
        # Do not log resume contents, filenames, or parser exception details.
        print(json.dumps({"error": "This file could not be read. Try exporting it as a new PDF or DOCX."}))
