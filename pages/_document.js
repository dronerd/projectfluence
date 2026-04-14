// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html className="scroll-smooth"> {/* ここで scroll-smooth を有効化 */}
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
