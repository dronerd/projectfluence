import { useState } from "react";
import type { WordImage } from "../lib/content";

/** Local lesson art keeps its meaning available without loading an external image service. */
export default function VocabularyImage({ image, loading = "eager" }: { image: WordImage; loading?: "eager" | "lazy" }) {
  // A different source must not inherit a previous image's error state.
  return <ImageContent key={image.src} image={image} loading={loading} />;
}

function ImageContent({ image, loading }: { image: WordImage; loading: "eager" | "lazy" }) {
  const [failed, setFailed] = useState(false);
  return <figure className="vs-vocabulary-image">
    {failed ? <div className="vs-image-fallback" role="status" lang="ja">
      <p>画像の代わりに、説明を読んでください。</p>
      <strong>{image.alt}</strong>
    </div> : <>
      {/* Native SVG delivery avoids a needless image transformation and preserves intrinsic dimensions. */}
      <img src={image.src} alt={image.alt} lang="ja" width={image.width} height={image.height} loading={loading} decoding="async" style={{ aspectRatio: `${image.width} / ${image.height}` }} onError={() => setFailed(true)} />
    </>}
    {image.license === "CC-BY-4.0" && <figcaption className="vs-image-credit"><a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.credit}</a>{" · "}<a href={image.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a></figcaption>}
  </figure>;
}
