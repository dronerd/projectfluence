import Image from "next/image";
import { learningApps, type LearningApp } from "../lib/brands";

export default function AppBrand({ app, className = "", compact = false }: { app: LearningApp; className?: string; compact?: boolean }) {
  const brand = learningApps[app];
  return <span className={`pf-app-brand${compact ? " pf-app-brand-compact" : ""} ${className}`}>
    <Image src={brand.image} alt="" width={compact ? 24 : 32} height={compact ? 24 : 32} />
    <span className="pf-app-brand-name">{brand.name}</span>
  </span>;
}
