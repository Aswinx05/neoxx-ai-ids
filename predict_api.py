from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np
import os

app = FastAPI()

# Model Path
MODEL_PATH = "model.joblib"

# Load the model
if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)
    print(f"[*] Model loaded from {MODEL_PATH}")
else:
    model = None
    print(f"[!] Model not found at {MODEL_PATH}. Please run 'python train_model.py' first.")

class FeatureVector(BaseModel):
    duration: float
    src_bytes: float
    dst_bytes: float
    count: int
    srv_count: int

@app.post("/predict")
async def predict(features: FeatureVector):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded. Run training first.")
    
    # Prepare data for prediction
    # Features: duration, src_bytes, dst_bytes, count, srv_count
    X = np.array([[features.duration, features.src_bytes, features.dst_bytes, features.count, features.srv_count]])
    
    # Prediction
    prediction = int(model.predict(X)[0])
    probabilities = model.predict_proba(X)[0]
    confidence = float(probabilities[prediction])
    
    return {
        "prediction": prediction, # 0: Normal, 1: Attack
        "confidence": confidence,
        "label": "Attack" if prediction == 1 else "Normal"
    }

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
