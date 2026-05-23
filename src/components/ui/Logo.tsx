import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
  const { logoUrl } = useAuth();
  const [imgError, setImgError] = useState(false);

  // Reset image error state whenever logoUrl changes
  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  if (imgError) {
    return (
      <div className={cn("flex items-center justify-center font-black text-xl tracking-tighter text-emerald-600", className)}>
        SecApp
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img 
        src={logoUrl || "/logo_file/logo_400pixel.png"} 
        alt="SecApp Logo" 
        className="h-full w-auto object-contain transition-all duration-300"
        onError={() => setImgError(true)}
      />
    </div>
  );
};
