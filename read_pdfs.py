import PyPDF2
import glob
import os

pdf_files = ["app_features.pdf", "CSE447 Lab Project Requirement [Spring-2026].pdf", "CSE447.pdf"]
with open("pdf_text.txt", "w", encoding="utf-8") as out:
    for pdf in pdf_files:
        out.write(f"\n--- {pdf} ---\n\n")
        try:
            reader = PyPDF2.PdfReader(pdf)
            for page in reader.pages:
                out.write(page.extract_text() + "\n")
        except Exception as e:
            out.write(f"Error reading {pdf}: {e}\n")
