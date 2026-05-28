import os
from pypdf import PdfReader

def extract_text(file_path: str) -> str:
    """
    Extracts text from a given PDF file.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found at {file_path}")
    
    text = ""
    try:
        reader = PdfReader(file_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    except Exception as e:
        raise Exception(f"Failed to parse PDF: {str(e)}")
    
    return text.strip()
