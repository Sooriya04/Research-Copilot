import uvicorn
from src.main import app

if __name__ == "__main__":
    print("🚀 Starting Research Copilot FastAPI Server on http://0.0.0.0:8000 ...")
    print("📖 Interactive OpenAPI docs available at: http://localhost:8000/docs")
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
