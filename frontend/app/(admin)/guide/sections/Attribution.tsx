'use client';

/**
 * Footer shared by every guide section: "<label> • Aulendur Labs".
 * Kept at text-white/50 so it stays readable (the old copies were text-white/20).
 */
export function Attribution({ label }: { label?: string }) {
  return (
    <div className="text-[10px] text-white/50 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
      {label ? <>{label} <span aria-hidden="true">•</span> </> : null}
      <a
        href="https://aulendur.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-white/90 hover:underline transition-colors"
      >
        Aulendur Labs
      </a>
    </div>
  );
}

export default Attribution;
