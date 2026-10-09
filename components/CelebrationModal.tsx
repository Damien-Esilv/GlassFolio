import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Star, Sparkles, X, ChevronRight } from 'lucide-react';
import Button from './Button';

export interface CelebrationData {
    type: 'level_up' | 'achievement' | 'rank';
    title: string;
    subtitle?: string;
    level?: number;
    xpGained?: number;
    iconType?: string;
    color?: string;
}

interface CelebrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: CelebrationData | null;
}

const CelebrationModal: React.FC<CelebrationModalProps> = ({ isOpen, onClose, data }) => {
    const { t } = useTranslation(['gamification', 'common']);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Particle / Confetti explosion animation
    useEffect(() => {
        if (!isOpen || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = [
            'hsl(239, 84%, 67%)',
            'hsl(160, 84%, 39%)',
            'hsl(38, 92%, 50%)',
            'hsl(330, 81%, 60%)',
            'hsl(217, 91%, 60%)',
            'hsl(270, 76%, 60%)'
        ];
        const particles: Array<{
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
            color: string;
            rotation: number;
            rotationSpeed: number;
            alpha: number;
        }> = [];

        // Spawn 80 particles
        for (let i = 0; i < 80; i++) {
            particles.push({
                x: canvas.width / 2 + (Math.random() - 0.5) * 50,
                y: canvas.height / 2 - 80 + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.8) * 14,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                alpha: 1
            });
        }

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let activeParticles = 0;
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.25; // gravity
                p.rotation += p.rotationSpeed;
                p.alpha -= 0.007;

                if (p.alpha > 0) {
                    activeParticles++;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, p.alpha);
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
                    ctx.restore();
                }
            });

            if (activeParticles > 0) {
                animationFrameId = requestAnimationFrame(render);
            }
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isOpen]);

    if (!isOpen || !data) return null;

    const isLevelUp = data.type === 'level_up';
    const isRank = data.type === 'rank';

    return createPortal(
        <div 
            className="fixed inset-0 z-[100050] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            {/* Canvas Confetti Layer */}
            <canvas 
                ref={canvasRef} 
                className="pointer-events-none fixed inset-0 z-10 w-full h-full"
            />

            {/* Modal Card */}
            <div 
                className="relative z-20 w-full max-w-md bg-card border border-subtle rounded-3xl p-8 shadow-2xl text-center transform animate-scale-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-secondary hover:text-primary rounded-full hover:bg-subtle transition-colors"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                {/* Animated Glowing Icon */}
                <div className="relative mx-auto mb-6 flex items-center justify-center w-24 h-24">
                    <div className="absolute inset-0 rounded-full bg-brand/20 blur-xl animate-pulse" />
                    <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-brand/10 border border-brand/30 text-brand shadow-inner">
                        {isLevelUp ? (
                            <Star size={40} className="animate-bounce" />
                        ) : isRank ? (
                            <Sparkles size={40} className="animate-spin-slow" />
                        ) : (
                            <Trophy size={40} />
                        )}
                    </div>
                </div>

                {/* Celebration Title */}
                <h3 className="text-2xl font-black text-primary mb-2">
                    {isLevelUp 
                        ? t('gamification:celebration.levelUpTitle') 
                        : isRank 
                            ? t('gamification:celebration.newRankTitle')
                            : t('gamification:celebration.badgeTitle')}
                </h3>

                {/* Subtitle / Details */}
                <p className="text-sm font-semibold text-secondary mb-4">
                    {data.subtitle || data.title}
                </p>

                {/* Level / Reward Tag */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-subtle border border-subtle mb-6 text-sm font-bold text-primary">
                    {data.level && (
                        <span>{t('gamification:level')} {data.level}</span>
                    )}
                    {data.level && data.xpGained && (
                        <span className="text-tertiary">•</span>
                    )}
                    {data.xpGained && (
                        <span className="text-brand">+{data.xpGained} {t('gamification:xp')}</span>
                    )}
                </div>

                {/* Action button */}
                <Button 
                    onClick={onClose} 
                    className="w-full py-3 flex items-center justify-center gap-2 text-base font-bold shadow-lg shadow-brand/20"
                >
                    <span>{t('gamification:celebration.continue')}</span>
                    <ChevronRight size={18} />
                </Button>
            </div>
        </div>,
        document.body
    );
};

export default CelebrationModal;
