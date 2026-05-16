"use client";
/* eslint-disable @next/next/no-img-element */

type ImageLightboxProps = {
  alt: string;
  onClose: () => void;
  src: string;
};

export function ImageLightbox({ alt, onClose, src }: ImageLightboxProps) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/82 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <button
        aria-label="Close photo viewer"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-[81] w-full max-w-xl">
        <div className="mb-3 flex justify-end">
          <button
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <img
          alt={alt}
          className="max-h-[78vh] w-full rounded-[28px] border border-white/12 object-contain shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
          src={src}
        />
      </div>
    </div>
  );
}
