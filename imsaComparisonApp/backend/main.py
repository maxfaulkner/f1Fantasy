from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from routers import filters, drivers, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(filters.router)
app.include_router(drivers.router)
app.include_router(profile.router)
