from fastapi import FastAPI, UploadFile, File, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import shutil
import cv2
import os
import uuid
import json
import pandas as pd
import numpy as np
from deepface import DeepFace
from sklearn.metrics.pairwise import cosine_similarity
import ast
import re

# =========================
# 初期化
# =========================
app = FastAPI()
UPLOAD_FOLDER = "uploads"  # Cloud Run なら "/tmp" を推奨
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# CORS（フロント: 3000 を許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ユーティリティ
# =========================
def norm_name(s: str) -> str:
    """名前の表記揺れを吸収（空白全削除）"""
    return re.sub(r"\s+", "", s or "")

# =========================
# データ読み込み
# =========================
# メンバー情報を「正規化したname」で引ける辞書にする
MEMBERS_JSON = "member_data_final_cleaned.json"
with open(MEMBERS_JSON, encoding="utf-8") as f:
    members_raw = json.load(f)

name_to_member = {}
for k, info in members_raw.items():
    nm = info.get("name", "")
    key = norm_name(nm)
    # 重複は最初の1件を採用（必要ならここを上書きに変えてOK）
    if key and key not in name_to_member:
        name_to_member[key] = {
            "name": info.get("name", ""),
            "group": info.get("group", ""),
            "image": info.get("image", "") or info.get("imageUrl", ""),
            "profileUrl": info.get("profileUrl", ""),
            "goods": info.get("goods", {}) or info.get("goodsLinks", {}),
        }

# 特徴量CSV（列: name, features）
FEATURES_CSV = "member_features_vggface_direct_ver1.1.csv"
df_features = pd.read_csv(FEATURES_CSV)

# 必須列チェック
if "features" not in df_features.columns or "name" not in df_features.columns:
    raise ValueError("CSVに 'name' または 'features' 列がありません。")

# "features"（"[0.1, 0.2, ...]"）→ np.array(4096,)
df_features["features"] = df_features["features"].apply(
    lambda s: np.array(ast.literal_eval(s), dtype=np.float32)
)

# 4096次元チェック
if not df_features["features"].apply(lambda v: isinstance(v, np.ndarray) and v.shape == (4096,)).all():
    raise ValueError("features列の次元が4096ではありません。CSVの内容を確認してください。")

# 正規化名列（突合せ用）
df_features["name_norm"] = df_features["name"].astype(str).apply(norm_name)

# 類似度計算のためのまとめ
name_list = df_features["name"].tolist()
member_matrix = np.stack(df_features["features"].to_numpy(), axis=0)  # (N,4096)

# 名前→特徴ベクトル辞書（/diagnose 用）
feature_dict = dict(zip(df_features["name"], df_features["features"]))

# =========================
# エンドポイント
# =========================
class DiagnoseRequest(BaseModel):
    filename: str  # ※互換のためそのまま。実際は "name"（メンバー名）を入れてください。

@app.get("/")
def root():
    return {"ok": True, "service": "oshimen-ai-api"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/diagnose")
def diagnose(req: DiagnoseRequest):
    """メンバー名を入力して上位の似てるメンバーを返す（自己診断用）"""
    query_name = req.filename
    if query_name not in feature_dict:
        return {"error": f"{query_name} not found in features."}

    query_vector = feature_dict[query_name].reshape(1, -1)
    sims = cosine_similarity(query_vector, member_matrix)[0]

    # 自分自身を除外して上位10
    similarities = []
    for i, nm in enumerate(name_list):
        if nm == query_name:
            continue
        similarities.append((nm, float(sims[i])))

    top_matches = sorted(similarities, key=lambda x: x[1], reverse=True)[:10]

    results = []
    for nm, score in top_matches:
        info = name_to_member.get(norm_name(nm), {"name": nm, "group": "", "image": "", "profileUrl": "", "goods": {}})
        results.append({
            "name": info.get("name", nm),
            "image": info.get("image", ""),
            "group": info.get("group", ""),
            "profileUrl": info.get("profileUrl", ""),
            "goods": info.get("goods", {}),
            "similarity_score": round(float(score), 4),
        })
    return {"results": results}

# 顔切り出し（DeepFace.extract_faces を使用）
def process_face(image_path, output_path, target_size=(160, 160)):
    try:
        faces = DeepFace.extract_faces(
            image_path,
            detector_backend="opencv",
            enforce_detection=False
        )
        print(f"✅ extract_faces 結果: {faces}")
        if not faces:
            print(f"❌ 顔が検出できませんでした: {image_path}")
            return None

        face = (faces[0]["face"] * 255).astype(np.uint8)  # 0-255 に戻す
        h, w, _ = face.shape
        max_dim = max(h, w)
        padded = np.ones((max_dim, max_dim, 3), dtype=np.uint8) * 255
        sx = (max_dim - w) // 2
        sy = (max_dim - h) // 2
        padded[sy:sy + h, sx:sx + w] = face
        resized = cv2.resize(padded, target_size)
        Image.fromarray(resized).save(output_path)
        return output_path
    except Exception as e:
        print(f"💥 顔処理エラー: {e}")
        return None

@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    # 1) 画像保存
    ext = os.path.splitext(image.filename)[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    # 2) 顔抽出・リサイズ
    cropped_path = os.path.join(UPLOAD_FOLDER, f"cropped_{filename}")
    result = process_face(save_path, cropped_path)
    if result is None:
        try:
            os.remove(save_path)
        except Exception:
            pass
        return {"error": "顔が検出できませんでした"}

    # 3) 埋め込み抽出（VGG-Face）
    try:
        rep = DeepFace.represent(
            img_path=cropped_path,
            model_name="VGG-Face",
            detector_backend="skip",
            enforce_detection=False
        )
        embedding = rep[0]["embedding"]
    except Exception as e:
        try:
            os.remove(save_path); os.remove(cropped_path)
        except Exception:
            pass
        return {"error": "特徴抽出に失敗しました", "details": str(e)}

    # 4) ユーザベクトル整形 & 類似度
    user_vec = np.array(embedding, dtype=np.float32)
    if user_vec.shape != (4096,):
        try:
            os.remove(save_path); os.remove(cropped_path)
        except Exception:
            pass
        return {"error": f"埋め込み次元が想定外です: got {user_vec.shape}"}

    user_vec = user_vec.reshape(1, -1)  # (1,4096)
    user_vec = np.nan_to_num(user_vec, copy=False)

    sims = cosine_similarity(user_vec, member_matrix)[0]  # (N,)

    # DataFrame化して上位を抽出（name重複除去 → 上位3）
    df_sorted = pd.DataFrame({
        "name": name_list,
        "similarity_score": sims.astype(float),
    }).sort_values("similarity_score", ascending=False)

    df_unique = df_sorted.drop_duplicates(subset=["name"]).head(3)

    # 5) メンバー情報付与（scoreは返さない仕様）
    results = []
    for _, row in df_unique.iterrows():
        nm = row["name"]
        info = name_to_member.get(norm_name(nm), {"name": nm, "group": "", "image": "", "profileUrl": "", "goods": {}})
        results.append({
            "image_name": nm,  # 互換用
            "name": info.get("name", nm),
            "group": info.get("group", ""),
            "imageUrl": info.get("image", ""),
            "profileUrl": info.get("profileUrl", ""),
            "goods": info.get("goods", {}),
            # "similarity_score": round(float(row["similarity_score"]), 4),
        })

    # 6) 後始末
    try:
        os.remove(save_path)
        os.remove(cropped_path)
    except Exception as e:
        print(f"⚠ 画像削除エラー: {e}")

    return {"results": results}

# =========================
# デバッグ用（突合せ可視化）
# =========================
@app.get("/debug/check-data")
def check_data(limit: int = Query(20, ge=1, le=200)):
    """CSV と JSON の名前突合せサマリ"""
    json_names = {norm_name(v.get("name", "")): v.get("name", "") for v in members_raw.values()}
    csv_names_norm = df_features["name_norm"].tolist()

    csv_not_in_json = [df_features.loc[i, "name"] for i, n in enumerate(csv_names_norm) if n not in json_names]
    json_not_in_csv = [v for k, v in json_names.items() if k not in set(csv_names_norm)]

    return {
        "csv_total": len(csv_names_norm),
        "json_total": len(json_names),
        "csv_not_in_json_count": len(csv_not_in_json),
        "json_not_in_csv_count": len(json_not_in_csv),
        "csv_not_in_json_sample": csv_not_in_json[:limit],
        "json_not_in_csv_sample": json_not_in_csv[:limit],
    }

@app.get("/debug/lookup")
def debug_lookup(name: str):
    """特定の表示名が JSON にヒットするか確認"""
    key = norm_name(name)
    hit = name_to_member.get(key)
    return {
        "query": name,
        "normalized": key,
        "found_in_json": bool(hit),
        "json_record": hit or {}
    }
