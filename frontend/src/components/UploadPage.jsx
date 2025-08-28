import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

/** API のベースURL（必要に応じて変更） */
const API_BASE = "http://127.0.0.1:8000";

/* JSON から全メンバー画像を取得（image or imageUrl） */
async function fetchAllMemberImages() {
  const res = await fetch("/member_data_final_cleaned.json", { cache: "reload" });
  const data = await res.json();
  const urls = Object.values(data).map((m) => m.image || m.imageUrl).filter(Boolean);
  return Array.from(new Set(urls));
}

/* ロード成功したURLだけ返す（タイムアウト付き） */
async function validateImageUrls(urls, timeoutMs = 6000, maxCheck = 500) {
  const toCheck = urls.slice(0, maxCheck);
  const checks = toCheck.map(
    (url) =>
      new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => {
          img.src = "";
          resolve(null);
        }, timeoutMs);
        img.onload = () => { clearTimeout(timer); resolve(url); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = encodeURI(url); // 日本語名対策
      })
  );
  const settled = await Promise.all(checks);
  const ok = settled.filter(Boolean);
  return ok.length ? ok : urls; // すべて失敗した場合の保険
}

/* 指定間隔で配列をローテーション（デフォ 7000ms = 7s） */
const useRotator = (list, intervalMs = 7000, seed = 0) => {
  const [idx, setIdx] = useState(seed);
  useEffect(() => {
    if (!list.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), intervalMs);
    return () => clearInterval(t);
  }, [list, intervalMs]);
  if (!list.length) return "";
  return list[idx % list.length];
};

/** ページ内スタイル */
const pageStyles = `
.upload-hero {
  min-height: 100vh;
  padding: 40px 16px;
  background: linear-gradient(180deg, rgba(155,135,255,0.15), rgba(173,216,230,0.15));
  display: grid;
  place-items: center;
}
.upload-shell { width: 100%; max-width: 1100px; }

/* ===== デスクトップ：3カラム（左画像・中央カード・右画像） ===== */
.upload-grid {
  display: grid;
  grid-template-columns: 1fr 420px 1fr;
  align-items: center;
  gap: 32px;
  grid-template-areas: "left center right";
}
.center-card { grid-area: center; }

/* .side-photos はデスクトップでは中身だけグリッドに流す */
.side-photos { display: contents; }
.side-left  { grid-area: left; }
.side-right { grid-area: right; }

/* サイド写真（左右） */
.side-photo {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(0,0,0,0.12);
  overflow: hidden;
}
.side-photo img {
  width: 100%;
  height: 100%;
  display: block;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  transition: opacity .45s ease;
  image-rendering: -webkit-optimize-contrast; /* Safari/Chrome系で有効 */
  image-rendering: crisp-edges;               /* そのほかのフォールバック */
  backface-visibility: hidden;
  transform: translateZ(0); 
}

/* 中央カード */
.center-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 18px 38px rgba(0,0,0,0.16);
  padding: 28px 24px;
}
.center-title {
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 14px;
}
.center-input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;  /* はみ出し防止 */
  display: block;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fafafa;
}
.center-actions {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

/* 診断する：黒背景・白文字 */
.primary-btn {
  border: none;
  border-radius: 999px;
  padding: 12px 14px;
  font-weight: 800;
  color: #fff;
  background: #111;
  cursor: pointer;
  transition: transform .1s ease, box-shadow .2s ease, opacity .2s ease;
  box-shadow: 0 10px 24px rgba(0,0,0,.35);
}
.primary-btn:disabled { opacity: .6; cursor: not-allowed; }
.primary-btn:hover { transform: translateY(-1px); }

/* ===== モバイル（≤900px）：上段に左右画像を横並び → 下段にカード ===== */
@media (max-width: 900px) {
  /* グリッドをやめて縦積み（配置のみ変更） */
  .upload-grid {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  /* 上段：左右の画像を横並び */
  .side-photos {
    display: flex;
    gap: 14px;
    justify-content: center;
    width: 100%;
  }
  /* 画像枠は横2枚＝約半分ずつ。比率3:4を維持 */
  .side-photo {
    width: 46%;
    max-width: 200px;   /* 必要なら調整 */
    border-radius: 14px;
    overflow: hidden;
  }
  .side-photo img {
    aspect-ratio: 3 / 4;
    object-fit: cover;
    width: 100%;
    height: auto;
    display: block;
  }

  /* 下段：アップロードカード */
  .center-card {
    max-width: 520px;
    align-self: center;
    padding: 22px 18px;
  }
  .center-title { font-size: 20px; line-height: 1.35; }
}
`;

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showcase, setShowcase] = useState([]); // ローテ対象（検証済みURL）
  const navigate = useNavigate();

  /* 全メンバー画像を取得→成功URLに絞り込み→セット */
  useEffect(() => {
    (async () => {
      try {
        const urls = await fetchAllMemberImages();
        // 少しだけプリロード（体感改善）
        urls.slice(0, 80).forEach((u) => { const i = new Image(); i.src = encodeURI(u); });
        // ✅ onload 成功したURLだけに絞り込み
        const ok = await validateImageUrls(urls, 6000, 500);
        setShowcase(ok);
      } catch (e) {
        console.error("メンバー画像の取得に失敗:", e);
        setShowcase([
          "https://goronyan-5628.github.io/member-images/images/nzk_賀喜遥香.jpg",
          "https://goronyan-5628.github.io/member-images/images/szk_森田ひかる.jpg",
          "https://goronyan-5628.github.io/member-images/images/hzk_小坂菜緒.jpg",
        ]);
      }
    })();
  }, []);

  // 左右のローテーション（開始位置はランダム、間隔 7s）
  const leftList = useMemo(() => {
    if (!showcase.length) return [];
    const start = Math.floor(Math.random() * showcase.length);
    return showcase.slice(start).concat(showcase.slice(0, start));
  }, [showcase]);
  const rightList = useMemo(() => {
    if (!showcase.length) return [];
    const start = Math.floor(Math.random() * showcase.length);
    return showcase.slice(start).concat(showcase.slice(0, start));
  }, [showcase]);

  const leftImg  = useRotator(leftList, 7000, 0);
  const rightImg = useRotator(rightList, 7000, 1);

  const onFileChange = (e) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert("ファイルを選択してください");
      return;
    }
    try {
      setLoading(true);
      const form = new FormData();
      form.append("image", selectedFile);
      const { data } = await axios.post(`${API_BASE}/analyze`, form);
      localStorage.setItem("analyzeResults", JSON.stringify(data?.results || []));
      navigate("/upload/result", { state: { results: data?.results || [] } });
    } catch (err) {
      console.error("診断エラー", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
      alert(`診断に失敗しました（${err.response?.status ?? "network"}）。`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-hero">
      <style>{pageStyles}</style>
      <div className="upload-shell">
        <div className="upload-grid">
          {/* ===== 上段（モバイル時は横並び）／デスクトップ時は左右に配置 ===== */}
          <div className="side-photos">
            <div className="side-photo side-left">
              {leftImg && <img src={encodeURI(leftImg)} alt="left showcase"  />}
            </div>
            <div className="side-photo side-right">
              {rightImg && <img src={encodeURI(rightImg)} alt="right showcase"  />}
            </div>
          </div>

          {/* ===== 下段（モバイル）／中央（デスクトップ） ===== */}
          <div className="center-card">
            <div className="center-title">好きな人の顔画像をアップロード</div>
            <input
              type="file"
              accept="image/*"
              className="center-input"
              onChange={onFileChange}
            />
            <div className="center-actions">
              <button className="primary-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? "診断中..." : "診断する"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
