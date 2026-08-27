from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, datasets

# NOTE: For an MVP, create_all() is fine. Once the schema stabilizes, switch to
# Alembic migrations so schema changes are tracked and reversible.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Data Detective API",
    description="AI-powered root cause analysis engine — backend API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(datasets.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
