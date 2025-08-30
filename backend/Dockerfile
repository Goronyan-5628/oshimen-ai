# ---- Python を 3.10 に固定 ----
FROM python:3.10-slim

# ---- ランタイム依存（OpenCV などで必要）----
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- 依存関係を先にコピー（ビルドキャッシュ有効化）----
COPY backend/requirements.txt /app/requirements.txt

# ---- CPU安定化（ログ抑制は必要に応じてコメント解除）----
ENV OMP_NUM_THREADS=1 \
    TF_NUM_INTRAOP_THREADS=1 \
    TF_NUM_INTEROP_THREADS=1
# ENV TF_CPP_MIN_LOG_LEVEL=2

# ---- Python 依存インストール ----
RUN pip install --no-cache-dir -r /app/requirements.txt

# ---- アプリ本体をコピー ----
COPY backend/ /app/

# ---- Render は 8080 を想定 ----
EXPOSE 8080

# ---- Uvicorn で起動（ワーカー1で安定運用）----
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
