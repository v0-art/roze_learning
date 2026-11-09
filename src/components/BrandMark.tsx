import React from 'react';

interface BrandMarkProps {
  size?: 'small' | 'large';
  showDomain?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'small', showDomain = false }) => (
  <span className={`inline-flex items-center ${size === 'large' ? 'gap-4' : 'gap-2.5'}`}>
    <span aria-hidden="true" className={`relative block shrink-0 overflow-hidden ${size === 'large' ? 'h-16 w-16' : 'h-10 w-10'}`}>
      <img src="/logo.png" alt="" className="absolute left-1/2 top-1/2 h-[150%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain" />
    </span>
    <span className="flex flex-col text-left leading-tight">
      <span className={`font-semibold tracking-tight text-slate-100 ${size === 'large' ? 'text-2xl' : 'text-base'}`}>rozephyr<span className="text-cyan-400">.</span>learning</span>
      {showDomain && <span className="mt-1 font-mono text-xs text-slate-400">rozephyr.learning.com</span>}
    </span>
  </span>
);
