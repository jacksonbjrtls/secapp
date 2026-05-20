import React from 'react';
import { cn } from '../../lib/utils';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img 
        src="/logo.png" 
        alt="SecApp Logo" 
        className="h-full w-auto object-contain"
        onError={(e) => {
          // Fallback if image is missing
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = '<span class="text-emerald-600 font-black text-2xl tracking-tighter">SecApp</span>';
        }}
      />
    </div>
  );
};
