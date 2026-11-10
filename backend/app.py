"""
app.py — Custom Holidays backend.
Gmail polling is heartbeat-based (frontend drives it), no background threads.
"""
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_database
from creatives.routes import router as creatives_router
from rag.routes import router as rag_router, cleanup_stuck_documents, check_jina_key
from itinerary.routes import router as itinerary_router
from itinerary.supplier_routes import router as suppliers_router
from gmail.routes import router as gmail_router
from prices.routes import router as prices_router
from finance.routes import router as finance_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\nStarting Custom Holidays backend...")
    init_database()
    check_jina_key()
    cleanup_stuck_documents()
    # NOTE: No auto-poll thread started here.
    # Gmail polling is driven by frontend heartbeat every 5 minutes.
    yield
    print("Stopping Custom Holidays backend...")


app = FastAPI(title="Custom Holidays", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(creatives_router, prefix="/api")
app.include_router(rag_router,        prefix="/api/rag")
app.include_router(itinerary_router,  prefix="/api/itinerary")
app.include_router(suppliers_router,  prefix="/api/suppliers")
app.include_router(gmail_router,      prefix="/api/gmail")
app.include_router(prices_router,     prefix="/api/prices")
app.include_router(finance_router,    prefix="/api/finance")

outputs_dir = Path("outputs")
outputs_dir.mkdir(exist_ok=True)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


@app.get("/")
def root():
    return {"status": "running", "service": "Custom Holidays"}
