FROM python:3.11-slim

# 作業ディレクトリ
WORKDIR /app

# 必要ファイルのコピー
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# FastAPIサーバーを起動（Cloud Run向け）
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
