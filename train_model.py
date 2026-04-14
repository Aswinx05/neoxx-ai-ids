import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib
import os
import requests

# 1. Load Dataset (Using the real NSL-KDD dataset)
# Features: duration, src_bytes, dst_bytes, count, srv_count
# Label: normal vs attack

def download_dataset():
    url = "https://raw.githubusercontent.com/defcom17/NSL-KDD/master/KDDTrain%2B.txt"
    filename = "KDDTrain+.txt"
    if not os.path.exists(filename):
        print(f"[*] Downloading NSL-KDD dataset from {url}...")
        response = requests.get(url)
        with open(filename, 'wb') as f:
            f.write(response.content)
        print("[*] Download complete!")
    return filename

def load_data():
    filename = download_dataset()
    
    # NSL-KDD column names (from documentation)
    columns = [
        'duration', 'protocol_type', 'service', 'flag', 'src_bytes', 'dst_bytes', 
        'land', 'wrong_fragment', 'urgent', 'hot', 'num_failed_logins', 'logged_in', 
        'num_compromised', 'root_shell', 'su_attempted', 'num_root', 'num_file_creations', 
        'num_shells', 'num_access_files', 'num_outbound_cmds', 'is_host_login', 
        'is_guest_login', 'count', 'srv_count', 'serror_rate', 'srv_serror_rate', 
        'rerror_rate', 'srv_rerror_rate', 'same_srv_rate', 'diff_srv_rate', 
        'srv_diff_host_rate', 'dst_host_count', 'dst_host_srv_count', 
        'dst_host_same_srv_rate', 'dst_host_diff_srv_rate', 'dst_host_same_src_port_rate', 
        'dst_host_srv_diff_host_rate', 'dst_host_serror_rate', 'dst_host_srv_serror_rate', 
        'dst_host_rerror_rate', 'dst_host_srv_rerror_rate', 'label', 'difficulty_level'
    ]
    
    print(f"[*] Loading dataset from {filename}...")
    df = pd.read_csv(filename, header=None, names=columns,sep = ",")
    
    # Select features requested by the user
    # duration, src_bytes, dst_bytes, count, srv_count
    features = ['duration', 'src_bytes', 'dst_bytes', 'count', 'srv_count']
    X = df[features]
    
    # Convert labels to binary: 0 for normal, 1 for everything else (attack)
    y = df['label'].apply(lambda x: 0 if x == 'normal' else 1)
    
    return X, y

def train():
    X, y = load_data()
    
    # 2. Preprocessing
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # 3. Model Training (Random Forest)
    print("Training Random Forest Classifier...")
    # Using a smaller number of estimators for speed in this environment
    rf = RandomForestClassifier(n_estimators=50, max_depth=10, random_state=42)
    rf.fit(X_train, y_train)
    
    # 4. Evaluation
    y_pred = rf.predict(X_test)
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # 5. Save the Model
    print("Saving model to 'model.joblib'...")
    joblib.dump(rf, 'model.joblib')
    print("Training Complete!")

if __name__ == "__main__":
    train()
