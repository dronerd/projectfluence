import { useState } from "react";
import type { WordImage } from "../lib/content";

/** Local lesson art keeps its meaning available without loading an external image service. */
export default function VocabularyImage({ image }: { image: WordImage }) {
  // A different source must not inherit a previous image's error state.
  return <ImageContent key={image.src} image={image} />;
}

function ImageContent({ image }: { image: WordImage }) {
  const [failed, setFailed] = useState(false);
  return <figure className="vs-vocabulary-image">
    {failed ? <div className="vs-image-fallback" role="status" lang="ja">
      <p>画像の代わりに、説明を読んでください。</p>
      <strong>{image.alt}</strong>
    </div> : <>
      {/* Native SVG delivery avoids a needless image transformation and preserves intrinsic dimensions. */}
      <img src={image.src} alt={image.alt} lang="ja" width={image.width} height={image.height} decoding="async" onError={() => setFailed(true)} />
      <figcaption><details><summary>画像の説明を読む</summary><p lang="ja">{image.alt}</p></details></figcaption>
    </>}
  </figure>;
}
