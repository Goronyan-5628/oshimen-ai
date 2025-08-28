import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** グループごとの淡い背景色＆アクセント */
const GROUP_BG = {
  "乃木坂46": "rgba(128, 0, 128, 0.08)",
  "櫻坂46":   "rgba(255, 182, 193, 0.12)",
  "日向坂46": "rgba(135, 206, 250, 0.12)",
};
const GROUP_ACCENT = {
  "乃木坂46": "#7c3aed",
  "櫻坂46":   "#ec4899",
  "日向坂46": "#38bdf8",
};
const norm = (g) => (g || "").replace(/\s/g, "");

/** サイトブランド色（グッズ用） */
const BRAND = { rakuten:"#bf0000", amazon:"#ff9900", yahoo:"#ff0033" };

/** 列数（3/2/1） */
const useColumns = () => {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const mq2 = window.matchMedia("(max-width: 900px)");
    const mq1 = window.matchMedia("(max-width: 560px)");
    const update = () => setCols(mq1.matches ? 1 : mq2.matches ? 2 : 3);
    update();
    mq2.addEventListener?.("change", update);
    mq1.addEventListener?.("change", update);
    return () => {
      mq2.removeEventListener?.("change", update);
      mq1.removeEventListener?.("change", update);
    };
  }, []);
  return cols;
};

/** 共有テキスト（X=ハッシュタグ付き, LINE=本文のみ） */
function buildGlobalShareLinks(results) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const uploadUrl = `${origin}/upload`;

  const top3 = (Array.isArray(results) ? results.slice(0, 3) : []).filter(Boolean);
  const namesJoined = top3.map(r => `${r.group}：${r.name}`).join("、");

  const baseText = top3.length
    ? `あなたの好きな人は...${namesJoined}です。診断はこちらから`
    : `あなたの好きな人は...です。診断はこちらから`;

  // X用ハッシュタグ（カンマ区切り、#は付けない指定）
  const hashtagParam = top3
    .map(r => (r?.name || "").replace(/\s+/g, "")) // スペース除去
    .filter(Boolean)
    .join(",");

  const xUrl   = `https://twitter.com/intent/tweet?text=${encodeURIComponent(baseText)}&url=${encodeURIComponent(uploadUrl)}${hashtagParam ? `&hashtags=${encodeURIComponent(hashtagParam)}` : ""}`;
  const lineUrl= `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(uploadUrl)}&text=${encodeURIComponent(baseText)}`;
  return { xUrl, lineUrl };
}

/** 名前→メンバー情報辞書（フォールバック用） */
const nameKey = (s="") => s.replace(/\s/g, ""); // 全角/半角スペース除去
function useMemberIndex() {
  const [index, setIndex] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/member_data_final_cleaned.json", { cache: "reload" });
        const data = await res.json();
        const byName = {};
        Object.values(data).forEach((m) => {
          if (m?.name) byName[nameKey(m.name)] = m;
        });
        setIndex(byName);
      } catch (e) {
        console.error("member index load failed", e);
      }
    })();
  }, []);
  return index;
}

/** スタイル */
const css = `
.result-wrap {
  min-height: 100vh;
  padding: 32px 16px 56px;
  background: linear-gradient(180deg, rgba(155,135,255,0.10), rgba(173,216,230,0.10));
}
.result-inner { max-width: 1100px; margin: 0 auto; }
.result-title { font-size: 22px; font-weight: 800; text-align: center; margin-bottom: 18px; }

/* グリッド */
.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 8px;
}

/* カード */
.card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  overflow: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  transition: opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1);
  transition-delay: var(--stagger, 0s);
  will-change: opacity, transform;
}
.card.show { opacity: 1; transform: translateY(0) scale(1); }

.card-head {
  width: 100%;
  aspect-ratio: 900 / 1134; /* 900×1134 の比率 */
  border-radius: 10px;
  overflow: hidden;
  transition: transform .2s ease, box-shadow .2s ease;
  box-shadow: 0 2px 10px rgba(0,0,0,.06);
}
.card-head:hover { transform: translateY(-6px); box-shadow: 0 10px 24px rgba(0,0,0,.18); }
.card-head img {
  width: 100%; height: 100%; object-fit: contain;
  image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;
  backface-visibility: hidden; transform: translateZ(0);
}

/* テキスト */
.group { margin-top: 10px; font-size: 14px; text-align: center; color: #374151; }
.name  { margin-top: 4px; font-size: 16px; font-weight: 800; text-align: center; }

/* セクション見出し */
.subtitle { margin-top: 10px; font-size: 13px; font-weight: 700; text-align: center; color: #4b5563; }

/* ボタン群（縦並び） */
.btns-vertical { display: grid; gap: 8px; margin-top: 8px; justify-items: center; }

/* ピルボタン共通 */
.pill-btn {
  display: inline-block; min-width: 160px; text-align: center;
  font-size: 13px; font-weight: 700; padding: 10px 14px;
  border-radius: 999px; border: 1px solid #d1d5db; text-decoration: none;
  color: #111827; background: #fff;
  transition: transform .12s ease, box-shadow .2s ease, opacity .2s ease, background .2s ease, color .2s ease;
}
.pill-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,0,0,.12); }

/* プロフィール（グループ色） */
.pill-profile { color: #fff; border: none; }

/* グッズ色 */
.pill-rakuten { color: #fff; border: none; }
.pill-amazon  { color: #111827; border: none; }
.pill-yahoo   { color: #fff; border: none; }

/* ▼ 共通シェアバー（カード群の下） */
.share-bar {
  margin-top: 20px;
  display: flex; gap: 10px; flex-wrap: wrap;
  justify-content: center; align-items: center;
}
.btn-x    { background:#000; color:#fff; border:none; }
.btn-line { background:#06C755; color:#fff; border:none; }
.btn-back { background:#f3f4f6; color:#111827; border:1px solid #e5e7eb; }
.share-label { font-size: 13px; color:#6b7280; margin-right: 6px; }

/* タブレット */
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, 1fr); } }
/* スマホ */
@media (max-width: 560px) {
  .cards { grid-template-columns: 1fr; }
  .result-title { font-size: 20px; }
}
`;

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const titleRef = useRef(null);
  const columns = useColumns();
  const memberIndex = useMemberIndex(); // ← 追加：フォールバック辞書

  // 1) localStorage 優先
  let results = [];
  try {
    const raw = localStorage.getItem("analyzeResults");
    if (raw) results = JSON.parse(raw);
  } catch {}
  // 2) state があれば上書き
  if (location?.state?.results && Array.isArray(location.state.results)) {
    results = location.state.results;
  }

  // スクロールイン演出 + タイトル見切れ防止
  const cardsRef = useRef([]);
  useEffect(() => {
    try {
      if (titleRef.current) titleRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
    const els = cardsRef.current.filter(Boolean);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("show"); io.unobserve(e.target); }});
    }, { threshold: 0.16 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [results]);

  const { xUrl, lineUrl } = buildGlobalShareLinks(results);

  return (
    <div className="result-wrap">
      <style>{css}</style>
      <div className="result-inner">
        <div className="result-title" ref={titleRef}>診断結果</div>

        {!Array.isArray(results) || results.length === 0 ? (
          <div style={{ textAlign: "center", color: "#6b7280" }}>
            結果がありません。アップロード画面から診断してください。
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => navigate("/upload")}
                style={{
                  border: "none", borderRadius: 9999, padding: "10px 14px",
                  background: "#8b5cf6", color: "#fff", fontWeight: 700,
                  boxShadow: "0 10px 24px rgba(139,92,246,.35)", cursor: "pointer",
                }}
              >アップロード画面へ</button>
            </div>
          </div>
        ) : (
          <>
            <div className="cards">
              {results.map((item, idx) => {
                const g = norm(item.group);
                const bg = GROUP_BG[g] || "#fff";
                const accent = GROUP_ACCENT[g] || "#111827";
                const delayMs = (idx % columns) * 120;

                // ▼ ここでフォールバック補完（名前一致）
                const canonical = memberIndex[nameKey(item.name)] || {};
                const profileUrl = item.profileUrl || canonical.profileUrl;
                const goods = item.goods || canonical.goods;

                return (
                  <div
                    key={idx}
                    className="card"
                    ref={(el) => (cardsRef.current[idx] = el)}
                    style={{
                      backgroundColor: bg,
                      borderTop: `4px solid ${accent}`,
                      ["--stagger"]: `${delayMs}ms`,
                    }}
                  >
                    <div className="card-head">
                      {item.imageUrl && <img src={item.imageUrl} alt={item.name} loading="lazy" />}
                    </div>

                    <div className="group">{item.group}</div>
                    <div className="name">{item.name}</div>

                    <div className="subtitle">プロフィールはこちら</div>
                    <div className="btns-vertical">
                      {profileUrl && (
                        <a
                          className="pill-btn pill-profile"
                          href={profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ background: GROUP_ACCENT[norm(item.group)] || "#111827" }}
                        >
                          公式プロフィール
                        </a>
                      )}
                    </div>

                    <div className="subtitle" style={{ marginTop: 12 }}>グッズはこちら</div>
                    <div className="btns-vertical">
                      {goods?.rakuten && (
                        <a className="pill-btn pill-rakuten" href={goods.rakuten} target="_blank" rel="noreferrer"
                           style={{ background: BRAND.rakuten }}>楽天</a>
                      )}
                      {goods?.amazon && (
                        <a className="pill-btn pill-amazon" href={goods.amazon} target="_blank" rel="noreferrer"
                           style={{ background: BRAND.amazon }}>Amazon</a>
                      )}
                      {goods?.yahoo && (
                        <a className="pill-btn pill-yahoo" href={goods.yahoo} target="_blank" rel="noreferrer"
                           style={{ background: BRAND.yahoo }}>Yahoo</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ▼ カード群の下に共通シェアバー */}
            <div className="share-bar">
              <span className="share-label">結果をシェア：</span>
              <a className="pill-btn btn-x" href={xUrl} target="_blank" rel="noreferrer">Xで共有</a>
              <a className="pill-btn btn-line" href={lineUrl} target="_blank" rel="noreferrer">LINEで共有</a>
              <button className="pill-btn btn-back" onClick={() => navigate("/upload")}>アップロード画面へ戻る</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
