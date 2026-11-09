"""
AI-powered supplier data extractor.
Takes raw email text + attachments and extracts structured supplier data
using OpenRouter LLM. Validates before inserting into Supabase.
"""
import json
import logging
import os
import re
from typing import Optional

import requests

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
EXTRACTION_MODEL = os.getenv("EXTRACTION_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")

CLASSIFICATION_PROMPT = """You are an expert at classifying travel supplier emails.

Classify this email into ONE of these categories:
- HOTEL_RATE: contains hotel room rates, tariffs, or pricing
- ACTIVITY_RATE: contains activity/tour pricing  
- TRANSFER_RATE: contains transfer/transport pricing
- CONTRACT: general supplier contract or agreement
- CANCELLATION_POLICY: cancellation or amendment policies
- BOOKING_CONFIRMATION: booking confirmed by supplier
- GENERAL_SUPPLIER: general supplier communication
- IRRELEVANT: not related to travel supplier operations

Also say what kind of supplier the sender is (supplier_type), one of:
DMC (destination management company / ground handler / local tour operator), Hotel, Transport, Activity Provider, Airline / GSA, Cruise, Travel Agency, Visa / Insurance, Other.
supplier_name is the sender's COMPANY name (not the person), as it appears in the signature or domain.

Respond with ONLY a JSON object:
{"category": "HOTEL_RATE", "supplier_name": "XYZ Travels", "supplier_type": "DMC", "destination": "Dubai", "confidence": 0.9}

No other text. Raw JSON only."""

EXTRACTION_PROMPT = """You are an expert at extracting structured supplier rate data from travel industry emails.

Extract ALL supplier rates mentioned. Return a JSON object with arrays for each type:

{
  "hotels": [
    {
      "hotel_name": "Exact hotel name",
      "destination": "City name",
      "star_rating": 4,
      "room_type": "Deluxe Room",
      "meal_plan": "BB",
      "price_per_night": 12000,
      "currency": "INR",
      "valid_from": "2026-10-01",
      "valid_to": "2026-12-31",
      "cancellation_policy": "Free cancellation 48 hours before check-in",
      "inclusions": ["breakfast", "wifi"]
    }
  ],
  "activities": [
    {
      "activity_name": "Desert Safari",
      "destination": "Dubai",
      "description": "Dune bashing with BBQ dinner",
      "duration_hours": 6,
      "price": 3500,
      "currency": "INR",
      "price_basis": "per_person",
      "valid_from": "2026-10-01",
      "valid_to": "2026-12-31",
      "inclusions": ["BBQ dinner", "camel ride"]
    }
  ],
  "transfers": [
    {
      "transfer_type": "Airport-Hotel",
      "destination": "Dubai",
      "route": "Dubai Airport to City Hotels",
      "vehicle_type": "Sedan",
      "price": 2500,
      "currency": "INR",
      "price_basis": "per_vehicle",
      "valid_from": "2026-10-01",
      "valid_to": "2026-12-31"
    }
  ]
}

Rules:
- meal_plan codes: BB=Breakfast, MAP=Half Board, AP=Full Board, EP=Room Only, AI=All Inclusive
- price_basis for activities: per_person or per_group
- price_basis for transfers: per_vehicle or per_person
- If a date is not mentioned, leave valid_from/valid_to as null
- Extract ALL rates mentioned, not just the first one
- If a field is not mentioned, use null
- Return raw JSON only, no code fences, no other text"""


def _llm_call(system: str, user: str) -> str:
    """Single LLM call via OpenRouter."""
    resp = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": EXTRACTION_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    # Strip think tags if present
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    content = re.sub(r"^```(?:json)?\s*", "", content).strip()
    content = re.sub(r"\s*```$", "", content).strip()
    return content


def classify_email(subject: str, body: str, sender: str) -> dict:
    """Classify an email to determine if it contains supplier rate data."""
    user_content = f"FROM: {sender}\nSUBJECT: {subject}\n\nBODY:\n{body[:3000]}"
    try:
        result = _llm_call(CLASSIFICATION_PROMPT, user_content)
        return json.loads(result)
    except Exception as e:
        logger.error("Classification failed: %s", e)
        return {"category": "IRRELEVANT", "supplier_name": "", "destination": "", "confidence": 0}


def extract_supplier_data(
    body: str,
    subject: str,
    sender: str,
    supplier_name: str,
    source_email_id: str,
    source_date: str,
    attachment_text: str = "",
) -> dict:
    """
    Extract structured supplier data from email body + attachment text.
    Returns dict with hotels/activities/transfers arrays.
    """
    combined_text = f"FROM: {sender}\nSUBJECT: {subject}\n\n"
    if body:
        combined_text += f"EMAIL BODY:\n{body[:4000]}\n\n"
    if attachment_text:
        combined_text += f"ATTACHMENT CONTENT:\n{attachment_text[:4000]}\n\n"

    try:
        result = _llm_call(EXTRACTION_PROMPT, combined_text)
        extracted = json.loads(result)
    except Exception as e:
        logger.error("Extraction failed: %s", e)
        return {"hotels": [], "activities": [], "transfers": []}

    # Inject source information into every extracted record
    for hotel in extracted.get("hotels", []):
        hotel["supplier_name"] = supplier_name
        hotel["source_email"] = sender
        hotel["source_date"] = source_date

    for activity in extracted.get("activities", []):
        activity["supplier_name"] = supplier_name
        activity["source_email"] = sender
        activity["source_date"] = source_date

    for transfer in extracted.get("transfers", []):
        transfer["supplier_name"] = supplier_name
        transfer["source_email"] = sender
        transfer["source_date"] = source_date

    return extracted


def extract_text_from_attachment(attachment_bytes: bytes, filename: str) -> str:
    """
    Extract text from PDF, DOCX, XLSX, or TXT attachment.
    Uses the same libraries as the existing RAG pipeline.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    text = ""

    try:
        if ext == "pdf":
            import io
            import pdfplumber
            with pdfplumber.open(io.BytesIO(attachment_bytes)) as pdf:
                pages = []
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    pages.append(page_text)
                text = "\n\n".join(pages)

        elif ext in ("xlsx", "xls"):
            import io
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(attachment_bytes), read_only=True)
                rows = []
                for sheet in wb.worksheets:
                    for row in sheet.iter_rows(values_only=True):
                        row_text = " | ".join(str(c) for c in row if c is not None)
                        if row_text.strip():
                            rows.append(row_text)
                text = "\n".join(rows)
            except ImportError:
                text = "[XLSX file — openpyxl not installed]"

        elif ext in ("docx", "doc"):
            import io
            from docx import Document
            doc = Document(io.BytesIO(attachment_bytes))
            text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

        elif ext in ("txt", "csv"):
            text = attachment_bytes.decode("utf-8", errors="replace")

    except Exception as e:
        logger.warning("Could not extract text from %s: %s", filename, e)

    return text[:8000]  # cap to avoid huge LLM context
