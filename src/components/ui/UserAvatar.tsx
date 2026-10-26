import React, { useState } from 'react';
import { THEME_INTENT } from '../../constants/themeTokens';

export interface UserAvatarProps {
  name?: string;
  email?: string;
  avatar?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base font-semibold',
  xl: 'w-24 h-24 text-2xl font-bold',
};

const getInitials = (name?: string, email?: string): string => {
  const source = (name?.trim() || email?.split('@')[0] || 'U').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

/** Only same-site paths, https URLs and inline raster images may be rendered as an avatar. */
const AVATAR_SOURCE = /^(\/(?!\/)|https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,|blob:)/i;

export const isValidAvatarUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('pravatar.cc')) return false;
  if (trimmed === '/avatars/local-user.jpg') return false;
  return AVATAR_SOURCE.test(trimmed);
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = '',
  email = '',
  avatar = '',
  size = 'sm',
  className = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const brandTokens = THEME_INTENT.brand;
  const hasValidImage = isValidAvatarUrl(avatar) && !imageFailed;

  if (hasValidImage) {
    return (
      <div
        className={`rounded-full overflow-hidden border border-subtle bg-subtle shrink-0 flex items-center justify-center ${sizeClass} ${className}`}
      >
        <img
          src={avatar.trim()}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  const initials = getInitials(name, email);

  return (
    <div
      aria-label={name || 'User'}
      className={`rounded-full shrink-0 flex items-center justify-center border font-bold select-none ${sizeClass} ${brandTokens.bgSubtle} ${brandTokens.text} ${brandTokens.border} ${className}`}
    >
      <span>{initials}</span>
    </div>
  );
};
