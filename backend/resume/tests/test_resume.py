import io
import sys
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parse_resume import MAX_BYTES, ResumeError, extract_text, parse_details, process

TEXT = """Alex Morgan
alex@example.test | (919) 555-0123 | github.com/alex-example
Education
Example State University
Bachelor of Science in Computer Science | May 2027
Technical Skills
Python, React, SQL, JavaScript
Experience
Software Intern, Example Company
Built a Python API serving student project data.
Projects
Career Planner - React and SQL
"""


def text_pdf(text=TEXT, pages=1):
    with fitz.open() as doc:
        for _ in range(pages):
            doc.new_page().insert_text((40, 45), text, fontsize=11)
        return doc.tobytes()


def docx(xml):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", xml)
    return buffer.getvalue()


class ResumeTests(unittest.TestCase):
    def test_structured_details_and_sections(self):
        result = parse_details(TEXT)
        self.assertEqual(result["full_name"], "Alex Morgan")
        self.assertEqual(result["email"], "alex@example.test")
        self.assertEqual(result["phone"], "(919) 555-0123")
        self.assertEqual(result["school"], "Example State University")
        self.assertEqual(result["major"], "Computer Science")
        self.assertIn("Example Company", result["sections"]["experience"])
        self.assertEqual(result["links"], ["github.com/alex-example"])
        self.assertNotIn("target_roles", result)
        self.assertNotIn("preferred_location", result)

    def test_text_pdf_avoids_ocr(self):
        with patch("parse_resume.ocr_image", side_effect=AssertionError("Unexpected OCR")):
            result = process(text_pdf())
        self.assertEqual(result["details"]["full_name"], "Alex Morgan")
        self.assertEqual(result["metadata"], {"pages": 1, "ocr_pages": 0})

    def test_mixed_pdf_checks_each_page(self):
        with fitz.open(stream=text_pdf(), filetype="pdf") as doc:
            doc.new_page()
            data = doc.tobytes()
        with patch("parse_resume.ocr_image", return_value="Projects\nScanned student project with Python and React") as ocr:
            result = process(data)
        self.assertEqual(ocr.call_count, 1)
        self.assertEqual(result["metadata"]["ocr_pages"], 1)
        self.assertIn("Scanned student project", result["text"])

    def test_docx(self):
        xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        for line in TEXT.splitlines():
            xml += f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>"
        xml += "</w:body></w:document>"
        result = process(docx(xml))
        self.assertEqual(result["details"]["major"], "Computer Science")
        self.assertIsNone(result["metadata"]["pages"])

    def test_rejects_xml_entities(self):
        with self.assertRaises(Exception):
            process(docx('<!DOCTYPE foo [<!ENTITY secret SYSTEM "file:///etc/passwd">]><foo>&secret;</foo>'))

    def test_size_signature_page_and_empty_validation(self):
        for data in (b"", b"x" * (MAX_BYTES + 1), b"not a resume", text_pdf(pages=6)):
            with self.subTest(size=len(data)), self.assertRaises(ResumeError):
                extract_text(data)
        with patch("parse_resume.ocr_image", return_value=""):
            with self.assertRaisesRegex(ResumeError, "No readable"):
                process(text_pdf(" "))

    def test_password_protected_pdf(self):
        with fitz.open(stream=text_pdf(), filetype="pdf") as doc:
            data = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="secret")
        with self.assertRaisesRegex(ResumeError, "password"):
            process(data)

    def test_real_image_ocr(self):
        image = Image.new("RGB", (1600, 700), "white")
        # PyMuPDF ships a cross-platform font; no user documents are used.
        font = ImageFont.truetype(io.BytesIO(fitz.Font("helv").buffer), 32)
        ImageDraw.Draw(image).multiline_text((50, 40), TEXT, font=font, fill="black", spacing=6)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        result = process(buffer.getvalue())
        self.assertIn("Python", result["text"])
        self.assertEqual(result["details"]["email"], "alex@example.test")
        self.assertEqual(result["metadata"]["ocr_pages"], 1)

    def test_real_scanned_pdf_ocr(self):
        image = Image.new("RGB", (1400, 500), "white")
        font = ImageFont.truetype(io.BytesIO(fitz.Font("helv").buffer), 32)
        ImageDraw.Draw(image).multiline_text((30, 30), "Alex Morgan\nalex@example.test\nTechnical Skills\nPython and SQL\nBuilt a student planning application", font=font, fill="black", spacing=8)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        with fitz.open() as document:
            page = document.new_page(width=700, height=250)
            page.insert_image(page.rect, stream=buffer.getvalue())
            data = document.tobytes()
        result = process(data)
        self.assertEqual(result["metadata"], {"pages": 1, "ocr_pages": 1})
        self.assertEqual(result["details"]["email"], "alex@example.test")


if __name__ == "__main__":
    unittest.main()
